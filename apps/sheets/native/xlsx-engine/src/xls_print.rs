//! Print settings of a BIFF8 workbook — the sheet substream's WSBOOL, SETUP,
//! margin, centering, gridline/heading, HEADER/FOOTER and page-break records,
//! and the globals' built-in Print_Area / Print_Titles names — rebuilt as the
//! OOXML elements the same settings live in (`sheetPr/pageSetUpPr`,
//! `printOptions`, `pageMargins`, `pageSetup`, `headerFooter`, `rowBreaks`,
//! `colBreaks`, `definedNames`). A converted sheet that Excel fits on one
//! page prints on one page here too. Best-effort like the rest of the binary
//! layer: a record that does not parse is skipped, and its setting keeps the
//! OOXML default.

use crate::xlsx_package::escape_xml;

/// Excel's margins when the sheet has no margin record (MS-XLS 2.4.142 etc.):
/// 0.75" left/right, 1" top/bottom, 0.5" header/footer.
const DEFAULT_MARGINS: [f64; 6] = [0.75, 0.75, 1.0, 1.0, 0.5, 0.5];

/// The SETUP record (MS-XLS 2.4.257).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Setup {
    paper_size: u16,
    scale: u16,
    page_start: i16,
    fit_width: u16,
    fit_height: u16,
    flags: u16,
    header_margin: f64,
    footer_margin: f64,
}

impl Setup {
    const LEFT_TO_RIGHT: u16 = 0x0001;
    const PORTRAIT: u16 = 0x0002;
    /// iPaperSize, iScale, iRes, iVRes, iCopies, fNoOrient and fPortrait are
    /// undefined (no printer was ever set up for the sheet).
    const NO_PLS: u16 = 0x0004;
    const NO_COLOR: u16 = 0x0008;
    const DRAFT: u16 = 0x0010;
    const NO_ORIENT: u16 = 0x0040;
    const USE_PAGE: u16 = 0x0080;

    fn has(&self, flag: u16) -> bool {
        self.flags & flag != 0
    }
}

/// One sheet's print settings as the binary records describe them.
#[derive(Default, Debug)]
pub(crate) struct XlsPageSetup {
    fit_to_page: bool,
    setup: Option<Setup>,
    /// left, right, top, bottom in inches.
    margins: [Option<f64>; 4],
    horizontal_centered: bool,
    vertical_centered: bool,
    gridlines: bool,
    headings: bool,
    header: Option<String>,
    footer: Option<String>,
    /// 0-based index of the row/column that starts a new page.
    row_breaks: Vec<u16>,
    col_breaks: Vec<u16>,
}

impl XlsPageSetup {
    /// Takes one sheet-substream record; false when it is not a print record.
    pub(crate) fn take_record(&mut self, id: u16, bytes: &[u8]) -> bool {
        match id {
            // WSBOOL: fFitToPage is bit 0 of the second byte
            0x0081 if bytes.len() >= 2 => {
                self.fit_to_page = u16::from_le_bytes([bytes[0], bytes[1]]) & 0x0100 != 0;
            }
            0x00A1 if bytes.len() >= 34 => {
                self.setup = Some(Setup {
                    paper_size: u16_at(bytes, 0),
                    scale: u16_at(bytes, 2),
                    page_start: u16_at(bytes, 4) as i16,
                    fit_width: u16_at(bytes, 6),
                    fit_height: u16_at(bytes, 8),
                    flags: u16_at(bytes, 10),
                    header_margin: f64_at(bytes, 16),
                    footer_margin: f64_at(bytes, 24),
                });
            }
            0x0026..=0x0029 if bytes.len() >= 8 => {
                self.margins[usize::from(id - 0x0026)] = Some(f64_at(bytes, 0));
            }
            0x0083 if bytes.len() >= 2 => self.horizontal_centered = u16_at(bytes, 0) != 0,
            0x0084 if bytes.len() >= 2 => self.vertical_centered = u16_at(bytes, 0) != 0,
            0x002B if bytes.len() >= 2 => self.gridlines = u16_at(bytes, 0) != 0,
            0x002A if bytes.len() >= 2 => self.headings = u16_at(bytes, 0) != 0,
            // an empty HEADER/FOOTER record means "none"
            0x0014 => self.header = unicode_string(bytes).filter(|text| !text.is_empty()),
            0x0015 => self.footer = unicode_string(bytes).filter(|text| !text.is_empty()),
            // HORIZONTALPAGEBREAKS / VERTICALPAGEBREAKS: cbrk, then 6-byte
            // entries whose first field is the row/column that starts a page
            0x001B | 0x001A if bytes.len() >= 2 => {
                let count = usize::from(u16_at(bytes, 0));
                let breaks = bytes[2..]
                    .chunks_exact(6)
                    .take(count)
                    .map(|entry| u16_at(entry, 0))
                    .filter(|&at| at > 0)
                    .collect();
                if id == 0x001B {
                    self.row_breaks = breaks;
                } else {
                    self.col_breaks = breaks;
                }
            }
            _ => return false,
        }
        true
    }

    /// `<sheetPr>` with the fit-to-page flag, or nothing.
    pub(crate) fn sheet_pr_xml(&self) -> String {
        if self.fit_to_page {
            r#"<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>"#.to_string()
        } else {
            String::new()
        }
    }

    /// The print elements that follow `mergeCells` in a worksheet, in schema
    /// order: printOptions, pageMargins, pageSetup, headerFooter, rowBreaks,
    /// colBreaks.
    pub(crate) fn tail_xml(&self) -> String {
        let mut out = String::new();
        let mut options = String::new();
        for (on, name) in [
            (self.horizontal_centered, "horizontalCentered"),
            (self.vertical_centered, "verticalCentered"),
            (self.headings, "headings"),
            (self.gridlines, "gridLines"),
        ] {
            if on {
                options.push_str(&format!(r#" {name}="1""#));
            }
        }
        if !options.is_empty() {
            out.push_str(&format!("<printOptions{options}/>"));
        }

        if self.setup.is_some() || self.margins.iter().any(Option::is_some) {
            let margin = |value: Option<f64>, default: f64| {
                value.filter(|v| v.is_finite() && (0.0..=49.0).contains(v)).unwrap_or(default)
            };
            let [left, right, top, bottom] =
                [0, 1, 2, 3].map(|i| margin(self.margins[i], DEFAULT_MARGINS[i]));
            let header = margin(self.setup.map(|s| s.header_margin), DEFAULT_MARGINS[4]);
            let footer = margin(self.setup.map(|s| s.footer_margin), DEFAULT_MARGINS[5]);
            out.push_str(&format!(
                r#"<pageMargins left="{}" right="{}" top="{}" bottom="{}" header="{}" footer="{}"/>"#,
                number(left),
                number(right),
                number(top),
                number(bottom),
                number(header),
                number(footer),
            ));
        }

        if let Some(setup) = self.setup {
            let mut attributes = String::new();
            if !setup.has(Setup::NO_PLS) {
                if (1..=256).contains(&setup.paper_size) {
                    attributes.push_str(&format!(r#" paperSize="{}""#, setup.paper_size));
                }
                if (10..=400).contains(&setup.scale) && setup.scale != 100 {
                    attributes.push_str(&format!(r#" scale="{}""#, setup.scale));
                }
            }
            if setup.has(Setup::USE_PAGE) {
                attributes.push_str(&format!(
                    r#" firstPageNumber="{}" useFirstPageNumber="1""#,
                    setup.page_start
                ));
            }
            // 0 is "automatic" on that axis; 1 is the OOXML default
            if setup.fit_width != 1 && setup.fit_width <= 32_767 {
                attributes.push_str(&format!(r#" fitToWidth="{}""#, setup.fit_width));
            }
            if setup.fit_height != 1 && setup.fit_height <= 32_767 {
                attributes.push_str(&format!(r#" fitToHeight="{}""#, setup.fit_height));
            }
            if setup.has(Setup::LEFT_TO_RIGHT) {
                attributes.push_str(r#" pageOrder="overThenDown""#);
            }
            if !setup.has(Setup::NO_PLS) && !setup.has(Setup::NO_ORIENT) {
                let orientation = if setup.has(Setup::PORTRAIT) {
                    "portrait"
                } else {
                    "landscape"
                };
                attributes.push_str(&format!(r#" orientation="{orientation}""#));
            }
            if setup.has(Setup::NO_COLOR) {
                attributes.push_str(r#" blackAndWhite="1""#);
            }
            if setup.has(Setup::DRAFT) {
                attributes.push_str(r#" draft="1""#);
            }
            if !attributes.is_empty() {
                out.push_str(&format!("<pageSetup{attributes}/>"));
            }
        }

        if self.header.is_some() || self.footer.is_some() {
            out.push_str("<headerFooter>");
            if let Some(header) = &self.header {
                out.push_str(&format!("<oddHeader>{}</oddHeader>", escape_xml(header)));
            }
            if let Some(footer) = &self.footer {
                out.push_str(&format!("<oddFooter>{}</oddFooter>", escape_xml(footer)));
            }
            out.push_str("</headerFooter>");
        }

        for (breaks, tag, max) in [
            (&self.row_breaks, "rowBreaks", 16_383),
            (&self.col_breaks, "colBreaks", 1_048_575),
        ] {
            if breaks.is_empty() {
                continue;
            }
            let entries: String = breaks
                .iter()
                .map(|at| format!(r#"<brk id="{at}" max="{max}" man="1"/>"#))
                .collect();
            out.push_str(&format!(
                r#"<{tag} count="{0}" manualBreakCount="{0}">{entries}</{tag}>"#,
                breaks.len()
            ));
        }
        out
    }
}

/// A built-in print name from the globals' NAME (Lbl) records.
#[derive(Debug, PartialEq)]
pub(crate) struct XlsPrintName {
    /// 0-based sheet index the name is scoped to.
    pub(crate) sheet: usize,
    /// true for Print_Titles, false for Print_Area.
    pub(crate) titles: bool,
    pub(crate) areas: Vec<PrintRange>,
}

/// rwFirst, rwLast, colFirst, colLast as BIFF8 stores them (0-based; a
/// whole column spans rows 0–0xFFFF, a whole row columns 0–0xFF).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct PrintRange {
    pub(crate) first_row: u16,
    pub(crate) last_row: u16,
    pub(crate) first_col: u16,
    pub(crate) last_col: u16,
}

/// Reads a NAME record; Some only for a sheet-scoped built-in Print_Area
/// (0x06) or Print_Titles (0x07) whose formula is plain 3-D areas.
pub(crate) fn print_name(bytes: &[u8]) -> Option<XlsPrintName> {
    if bytes.len() < 15 {
        return None;
    }
    let flags = u16_at(bytes, 0);
    let name_length = usize::from(bytes[3]);
    let formula_length = usize::from(u16_at(bytes, 4));
    let sheet = usize::from(u16_at(bytes, 8));
    // fBuiltin, a one-character name, a sheet scope
    if flags & 0x0020 == 0 || name_length != 1 || sheet == 0 {
        return None;
    }
    let high_byte = bytes[14] & 0x01 != 0;
    let code = bytes[15..].first().copied()?;
    let titles = match code {
        0x06 => false,
        0x07 => true,
        _ => return None,
    };
    let formula_start = 15 + if high_byte { 2 } else { 1 };
    let formula = bytes.get(formula_start..formula_start + formula_length)?;
    let areas = formula_areas(formula)?;
    if areas.is_empty() {
        return None;
    }
    Some(XlsPrintName {
        sheet: sheet - 1,
        titles,
        areas,
    })
}

/// The areas of a print-name formula: PtgArea3d / PtgRef3d joined by
/// PtgUnion, optionally wrapped in PtgMemFunc and parentheses. Any other
/// token gives up on the name.
fn formula_areas(mut rgce: &[u8]) -> Option<Vec<PrintRange>> {
    let mut areas = Vec::new();
    while let Some(&token) = rgce.first() {
        match token {
            // PtgArea3d (reference / value / array class)
            0x3B | 0x5B | 0x7B if rgce.len() >= 11 => {
                areas.push(PrintRange {
                    first_row: u16_at(rgce, 3),
                    last_row: u16_at(rgce, 5),
                    first_col: u16_at(rgce, 7) & 0x3FFF,
                    last_col: u16_at(rgce, 9) & 0x3FFF,
                });
                rgce = &rgce[11..];
            }
            // PtgRef3d
            0x3A | 0x5A | 0x7A if rgce.len() >= 7 => {
                let row = u16_at(rgce, 3);
                let col = u16_at(rgce, 5) & 0x3FFF;
                areas.push(PrintRange {
                    first_row: row,
                    last_row: row,
                    first_col: col,
                    last_col: col,
                });
                rgce = &rgce[7..];
            }
            // PtgMemFunc: the subexpression length, then the areas themselves
            0x29 | 0x49 | 0x69 if rgce.len() >= 3 => rgce = &rgce[3..],
            // PtgUnion, PtgParen
            0x10 | 0x15 => rgce = &rgce[1..],
            _ => return None,
        }
    }
    Some(areas)
}

/// The OOXML formula of a print name: `'Sheet'!$A$1:$H$30`, whole rows as
/// `'Sheet'!$1:$3`, whole columns as `'Sheet'!$A:$B`, several areas joined
/// by commas.
pub(crate) fn print_name_formula(sheet_name: &str, areas: &[PrintRange]) -> String {
    let quoted = format!("'{}'", sheet_name.replace('\'', "''"));
    areas
        .iter()
        .map(|area| {
            let whole_rows = area.first_col == 0 && area.last_col >= 0xFF;
            let whole_cols = area.first_row == 0 && area.last_row == 0xFFFF;
            let reference = if whole_rows && !whole_cols {
                format!("${}:${}", u32::from(area.first_row) + 1, u32::from(area.last_row) + 1)
            } else if whole_cols && !whole_rows {
                format!("${}:${}", column_letters(area.first_col), column_letters(area.last_col))
            } else {
                format!(
                    "${}${}:${}${}",
                    column_letters(area.first_col),
                    u32::from(area.first_row) + 1,
                    column_letters(area.last_col),
                    u32::from(area.last_row) + 1,
                )
            };
            format!("{quoted}!{reference}")
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn column_letters(column: u16) -> String {
    let mut letters = String::new();
    let mut remaining = u32::from(column) + 1;
    while remaining > 0 {
        remaining -= 1;
        letters.insert(0, char::from(b'A' + (remaining % 26) as u8));
        remaining /= 26;
    }
    letters
}

/// XLUnicodeString: cch, fHighByte, then 1-byte (Latin-1) or UTF-16LE
/// characters.
fn unicode_string(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 3 {
        return None;
    }
    let count = usize::from(u16_at(bytes, 0));
    let chars = &bytes[3..];
    if bytes[2] & 0x01 != 0 {
        let units: Vec<u16> = chars
            .chunks_exact(2)
            .take(count)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        Some(String::from_utf16_lossy(&units))
    } else {
        Some(chars.iter().take(count).map(|&b| char::from(b)).collect())
    }
}

/// Shortest decimal spelling of a margin (0.75, not 0.75000000000000).
fn number(value: f64) -> String {
    let text = format!("{value:.6}");
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn u16_at(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

fn f64_at(bytes: &[u8], at: usize) -> f64 {
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&bytes[at..at + 8]);
    f64::from_le_bytes(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_record(paper: u16, scale: u16, fit: (u16, u16), flags: u16) -> Vec<u8> {
        let mut bytes = Vec::new();
        for value in [paper, scale, 1, fit.0, fit.1, flags, 600, 600] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&0.3f64.to_le_bytes());
        bytes.extend_from_slice(&0.2f64.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes
    }

    #[test]
    fn a_sheet_fitted_to_one_landscape_page_keeps_its_setup() {
        let mut page = XlsPageSetup::default();
        assert!(page.take_record(0x0081, &0x05C1u16.to_le_bytes()));
        assert!(page.take_record(0x00A1, &setup_record(9, 55, (1, 1), 0x0000)));
        assert!(page.take_record(0x0026, &0.25f64.to_le_bytes()));
        assert!(page.take_record(0x0029, &0.5f64.to_le_bytes()));
        assert!(page.take_record(0x0083, &1u16.to_le_bytes()));
        assert!(!page.take_record(0x0208, &[0; 16]));

        assert_eq!(page.sheet_pr_xml(), r#"<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>"#);
        let tail = page.tail_xml();
        assert!(tail.starts_with(r#"<printOptions horizontalCentered="1"/>"#), "{tail}");
        assert!(tail.contains(
            r#"<pageMargins left="0.25" right="0.75" top="1" bottom="0.5" header="0.3" footer="0.2"/>"#
        ));
        assert!(tail.contains(r#"<pageSetup paperSize="9" scale="55" orientation="landscape"/>"#));
    }

    #[test]
    fn undefined_printer_fields_are_left_out() {
        let mut page = XlsPageSetup::default();
        // fNoPls: paper, scale and orientation are not meaningful
        page.take_record(0x00A1, &setup_record(0, 0, (1, 0), Setup::NO_PLS | Setup::PORTRAIT));
        let tail = page.tail_xml();
        assert!(tail.contains(r#"<pageSetup fitToHeight="0"/>"#), "{tail}");
        assert!(page.sheet_pr_xml().is_empty());
    }

    #[test]
    fn headers_footers_and_manual_breaks_come_along() {
        let mut page = XlsPageSetup::default();
        let mut header = vec![3, 0, 1];
        for unit in "&C가".encode_utf16() {
            header.extend_from_slice(&unit.to_le_bytes());
        }
        page.take_record(0x0014, &header);
        page.take_record(0x0015, &[]);
        let mut breaks = 2u16.to_le_bytes().to_vec();
        for row in [20u16, 41] {
            breaks.extend_from_slice(&row.to_le_bytes());
            breaks.extend_from_slice(&0u16.to_le_bytes());
            breaks.extend_from_slice(&255u16.to_le_bytes());
        }
        page.take_record(0x001B, &breaks);
        let tail = page.tail_xml();
        assert!(tail.contains("<headerFooter><oddHeader>&amp;C가</oddHeader></headerFooter>"));
        assert!(tail.contains(
            r#"<rowBreaks count="2" manualBreakCount="2"><brk id="20" max="16383" man="1"/><brk id="41" max="16383" man="1"/></rowBreaks>"#
        ));
    }

    fn name_record(code: u8, sheet: u16, formula: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&0x0020u16.to_le_bytes());
        bytes.push(0);
        bytes.push(1);
        bytes.extend_from_slice(&(formula.len() as u16).to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        bytes.extend_from_slice(&sheet.to_le_bytes());
        bytes.extend_from_slice(&[0, 0, 0, 0]);
        bytes.push(0);
        bytes.push(code);
        bytes.extend_from_slice(formula);
        bytes
    }

    fn area3d(rows: (u16, u16), cols: (u16, u16)) -> Vec<u8> {
        let mut bytes = vec![0x3B, 0, 0];
        for value in [rows.0, rows.1, cols.0 | 0xC000, cols.1 | 0xC000] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn print_area_and_titles_become_sheet_scoped_formulas() {
        let area = print_name(&name_record(0x06, 2, &area3d((0, 29), (0, 7)))).unwrap();
        assert_eq!(area.sheet, 1);
        assert!(!area.titles);
        assert_eq!(print_name_formula("시간'표", &area.areas), "'시간''표'!$A$1:$H$30");

        // titles: rows 1–3 and columns A–B, as a PtgMemFunc union
        let mut formula = vec![0x29, 23, 0];
        formula.extend(area3d((0, 0xFFFF), (0, 1)));
        formula.extend(area3d((0, 2), (0, 0xFF)));
        formula.push(0x10);
        let titles = print_name(&name_record(0x07, 1, &formula)).unwrap();
        assert!(titles.titles);
        assert_eq!(print_name_formula("S", &titles.areas), "'S'!$A:$B,'S'!$1:$3");

        // a workbook-scoped or user-defined name is not a print name
        assert_eq!(print_name(&name_record(0x06, 0, &area3d((0, 1), (0, 1)))), None);
        assert_eq!(print_name(&name_record(0x0D, 1, &area3d((0, 1), (0, 1)))), None);
    }
}
