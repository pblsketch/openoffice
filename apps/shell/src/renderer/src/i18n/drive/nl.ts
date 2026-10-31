import type { zh } from './zh'

export const nl = {
  driveNav: 'Google Drive',
  driveDesc:
    'Kies bestanden in Google Drive en open en bewerk ze in GenOffice; bij opslaan gaan ze terug naar Drive. GenOffice kan alleen de bestanden openen die je kiest.',
  driveConnect: 'Google Drive koppelen',
  driveConnecting: 'Log in de browser in met je Google-account en geef toegang…',
  driveCancel: 'Annuleren',
  driveConnectedAs: 'Gekoppeld als {email}',
  driveDisconnect: 'Ontkoppelen',
  driveDisconnectConfirm:
    'Hiermee wordt de Drive-aanmelding van deze pc verwijderd en wordt Google gevraagd de toegang van GenOffice in te trekken. Kopieën op deze pc blijven bewaard.',
  driveDisconnectYes: 'Ontkoppelen',
  driveNotPersisted:
    'Deze pc kan de aanmelding niet versleuteld bewaren, dus de koppeling stopt als je de app sluit.',
  driveExpired:
    'Google heeft de koppeling beëindigd: de toegang is ingetrokken of de aanmelding is verlopen. Koppel opnieuw.',
  driveAiAccess: 'De AI bestanden in Drive laten zoeken en lezen',
  driveAiAccessDesc:
    'Als dit aan staat, kan de AI in de editors de Drive-bestanden die je hier hebt gekozen doorzoeken en lezen. Wat de AI leest, gaat naar de AI-aanbieder die je gebruikt. De AI kan Drive-bestanden niet wijzigen, verwijderen of delen.',
  drivePrivacy:
    'Bestandslijsten en -inhoud gaan alleen tussen deze pc en Google. Ze gaan nooit via een server van de makers van GenOffice.',
  driveFailDenied: 'Koppelen is mislukt omdat Google het niet toestond.',
  driveFailScope:
    'Koppelen is mislukt omdat toegang tot Drive niet was aangevinkt. Koppel opnieuw en vink het Drive-item aan.',
  driveFailTimeout: 'De aanmelding is niet binnen 10 minuten voltooid. Probeer het opnieuw.',
  driveFailNetwork:
    'Google is niet bereikbaar. Controleer je internetverbinding en probeer het opnieuw.',
  driveRecent: 'Gekozen bestanden',
  driveSearchPlaceholder: 'Zoeken in gekozen bestanden',
  driveSearchResults: 'Resultaten voor “{q}”',
  driveRefresh: 'Vernieuwen',
  driveNotConnectedTitle: 'Google Drive is niet gekoppeld',
  driveNotConnectedBody:
    'Na het koppelen kun je Drive-bestanden kiezen en ze hier openen en bewerken, en bij opslaan gaan ze terug naar Drive.',
  driveOpenSettings: 'Koppelen in Instellingen',
  driveEmpty: 'Nog geen bestanden. Klik op “Kiezen uit Google Drive” om er een paar te kiezen.',
  driveLoading: 'Laden…',
  driveLoadMore: 'Meer tonen',
  driveOpening: 'Openen…',
  driveGoogleBadge: 'Google-indeling',
  driveGoogleNote:
    'Een Google-document opent als Office-bestand. Bij opslaan blijft het origineel ongewijzigd en wordt er een Office-bestand naast opgeslagen, of in Mijn Drive.',
  driveReadOnly: 'Alleen bekijken',
  driveReadOnlyNote:
    'Je mag dit bestand niet bewerken. Bij opslaan wordt gevraagd of je een kopie in Drive wilt opslaan.',
  driveUnsupported: 'Deze app kan dit soort bestand niet openen.',
  driveErrNotConnected: 'Google Drive is ontkoppeld. Koppel het opnieuw in Instellingen.',
  driveErrNotFound: 'Bestand niet gevonden. Het is verwijderd, of dit account kan het niet zien.',
  driveErrForbidden: 'Dit account mag dit bestand niet downloaden.',
  driveErrTooLarge: 'Het bestand is te groot om te openen.',
  driveErrRateLimit: 'Google houdt verzoeken even tegen. Probeer het zo opnieuw.',
  driveErrNetwork: 'Google Drive is niet bereikbaar. Controleer je internetverbinding.',
  driveErrDisk: 'Het bestand kon niet op deze pc worden opgeslagen.',
  drivePick: 'Kiezen uit Google Drive',
  drivePicking: 'Kies bestanden in het Google-venster dat in je browser is geopend…',
  drivePickNote:
    'GenOffice kan alleen de Drive-bestanden openen die je in het venster van Google kiest. Bestanden die je eenmaal hebt gekozen, blijven in deze lijst staan.',
  driveTrainingTitle: 'Voordat je Drive-bestanden met AI gebruikt',
  driveTrainingBody:
    'Google staat niet toe dat Drive-bestanden naar een AI-dienst gaan die ze gebruikt om zijn modellen te trainen. Persoonlijke abonnementen van Claude, ChatGPT en Codex kunnen je chats gebruiken voor training, tenzij je dat uitzet: in Claude onder Instellingen → Privacy, in ChatGPT onder Instellingen → Gegevensbeheer → “Improve the model for everyone”. Aanbieders met een API-sleutel trainen standaard niet op API-gegevens. Gratis AI-verbindingen krijgen nooit Drive-bestanden.',
  driveTrainingAck: 'Modeltraining staat uit in de AI-accounts die ik met Drive-bestanden gebruik',
  driveFailTraining: 'Vink eerst hierboven het item over modeltraining aan.',
} satisfies Record<keyof typeof zh, string>
