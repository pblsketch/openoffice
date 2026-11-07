<map version="freeplane 1.9.13">
<attribute_registry SHOW_ATTRIBUTES="hide"/>
<node LOCALIZED_TEXT="new_mindmap" FOLDED="false" ID="ID_2000" CREATED="1700000000000" MODIFIED="1700000000000"><hook NAME="MapStyle">
    <properties edgeColorConfiguration="#808080ff,#ff0000ff" fit_to_viewport="false"/>
    <map_styles>
<stylenode LOCALIZED_TEXT="styles.root_node" STYLE="oval" UNIFORM_SHAPE="true" VGAP_QUANTITY="24 pt">
<font SIZE="24"/>
<stylenode LOCALIZED_TEXT="styles.predefined" POSITION="bottom_or_right" STYLE="bubble">
<stylenode LOCALIZED_TEXT="default" ICON_SIZE="12 pt" COLOR="#000000" STYLE="fork">
<font NAME="SansSerif" SIZE="10" BOLD="false" ITALIC="false"/>
</stylenode>
</stylenode>
</stylenode>
</map_styles>
</hook>
<hook NAME="AutomaticEdgeColor" COUNTER="3" RULE="ON_BRANCH_CREATION"/>
<node TEXT="한글 가지" POSITION="bottom_or_right" ID="ID_2001" CREATED="1700000000001" MODIFIED="1700000000001">
<edge COLOR="#ff0000"/>
<node TEXT="잎 하나" ID="ID_2002" CREATED="1700000000002" MODIFIED="1700000000002">
<richcontent TYPE="NOTE" CONTENT-TYPE="xml/">
<html>
  <head>
    
  </head>
  <body>
    <p>
      메모 첫 줄
    </p>
  </body>
</html>
</richcontent>
</node>
<node TEXT="Details here" ID="ID_2003" CREATED="1700000000003" MODIFIED="1700000000003">
<richcontent TYPE="DETAILS">
<html>
  <head>
    
  </head>
  <body>
    <p>
      detail text that is not imported
    </p>
  </body>
</html>
</richcontent>
<richcontent TYPE="NOTE" CONTENT-TYPE="plain/">
<text>Plain note
second line</text>
</richcontent>
</node>
</node>
<node TEXT="Folded branch" FOLDED="true" POSITION="right" ID="ID_2004" CREATED="1700000000004" MODIFIED="1700000000004" LINK="mailto:someone@example.org">
<node TEXT="Hidden child" ID="ID_2005" CREATED="1700000000005" MODIFIED="1700000000005"/>
</node>
</node>
</map>
