(function () {
  const STORAGE_KEY = 'recordpathai_language';
  const LEGACY_STORAGE_KEY = 'recordpathai_lang';
  const DEFAULT_LANG = 'en';
  const dictionary = {
    en: {
      'lang.label': 'Language Access',
      'lang.english': 'English',
      'lang.spanish': 'Español',
      'translation.disclaimer': 'Translation is provided for convenience and may not replace official court translation services.',
      'nav.home': 'Home',
      'nav.how': 'How It Works',
      'nav.eligibility': 'Eligibility',
      'nav.recordDetails': 'Record Details',
      'nav.packet': 'Packet',
      'nav.checkEligibility': 'Check Eligibility Free',

      'index.hero.title': 'Court record relief, automated.',
      'index.hero.seeHow': 'See How It Works',
      'how.title': 'How It Works',
      'eligibility.title': 'Eligibility Intake',
      'record.title': 'Record Details',
      'packet.title': 'Your Filing Packet',

      'index.eyebrow': 'Court document automation',
      'index.hero.copy': 'Check your eligibility for free, enter your case details, generate a court-ready filing packet when eligible, and complete secure online payment online.',
      'index.trust': 'Free eligibility checks. Secure online payment is now live.',
      'index.workflow': 'RecordPathAI Workflow',
      'index.packetBuilder': 'Court Packet Builder',
      'index.status.ready': 'Ready',
      'index.progress.pdf': 'PDF Packet',
      'index.progress.packet': 'Packet',
      'index.progress.payment': 'Payment',
      'index.caseState': 'Case State',
      'index.county': 'County',
      'index.selectedCourtForm': 'Selected Court Form',
      'index.pdfGenerated': 'PDF Generated',
      'index.mappedFields': '33 mapped fields filled',
      'index.problem.title': 'The Problem',
      'index.problem.copy': 'Record relief is confusing, fragmented, and court-specific.',
      'index.solution.title': 'The Solution',
      'index.solution.copy': 'RecordPathAI converts user intake into structured data and generates court-specific filing packets.',
      'index.how.1.title': '1. Free Eligibility Check',
      'index.how.1.copy': 'Answer questions about your record and state to determine possible eligibility.',
      'index.how.2.title': '2. Record Details',
      'index.how.2.copy': 'Enter charges, courts, dates, outcomes, and case-specific information.',
      'index.how.3.title': '3. Packet & Payment',
      'index.how.3.copy': 'Generate your court-ready filing packet and complete secure online payment.',
      'index.built.title': 'Built for consumer access. Designed for court-tech integration.',
      'index.consumer.title': 'Consumer Front Door',
      'index.consumer.copy': 'Helps users start before they reach court systems.',
      'index.structured.title': 'Structured Legal Data',
      'index.structured.copy': 'Turns messy record information into standardized packet data.',
      'index.future.title': 'Future B2B Potential',
      'index.future.copy': 'Can integrate upstream with courts, legal aid, and case management platforms.',
      'index.capability.title': 'Current Capability',
      'index.now.title': 'What RecordPathAI does now',
      'index.now.1': 'Free eligibility screening',
      'index.now.2': 'Captures case and offense details',
      'index.now.3': 'Determines packet direction by case state',
      'index.now.4': 'Generates printable mapped PDF packets',
      'index.now.5': 'Processes secure online payments',
      'index.next.title': 'Roadmap',
      'index.next.1': 'Expanded court coverage',
      'index.next.2': 'Court e-filing integrations',
      'index.next.3': 'Automated form retrieval',
      'index.next.4': 'Case-management platform integrations',
      'index.cta.title': 'Start with your free eligibility check.',
      'footer.copy': 'Guided record relief workflow and court packet preparation.',
      'footer.legal': 'RecordPathAI is not a law firm and does not provide legal advice. Documents are generated based on user input and publicly available forms.',
      'footer.terms': 'Terms',
      'footer.privacy': 'Privacy',
      'footer.disclaimer': 'Disclaimer',
      'eligibility.eyebrow': 'Step 1 of the workflow',
      'eligibility.pageTitle': 'Start Your Eligibility Intake',
      'eligibility.contact.title': 'Your Contact Information',
      'eligibility.firstName': 'First Name',
      'eligibility.lastName': 'Last Name',
      'eligibility.fullName': 'Full Legal Name',
      'eligibility.email': 'Email',
      'eligibility.phone': 'Phone',
      'eligibility.address1': 'Street Address',
      'eligibility.address2': 'Apartment / Unit',
      'eligibility.city': 'City',
      'eligibility.residenceState': 'Residence State',
      'eligibility.zip': 'ZIP',
      'eligibility.notes': 'Optional Notes',
      'eligibility.save': 'Save Intake',
      'eligibility.continue': 'Save and Continue',
      'eligibility.next.title': 'What happens next',

      'how.eyebrow': 'Step 1 · Intake to Filing Path',
      'record.eyebrow': 'Step 2 of the workflow',
      'packet.eyebrow': 'Step 3 of the workflow',
      'packet.eligibilityStatus': 'Eligibility Status',
      'packet.reliefType': 'Relief Type',
      'packet.dischargeDate': 'Discharge Date',
      'packet.waitingPeriod': 'Required Waiting Period',
      'packet.estimatedEligibleDate': 'Estimated Eligible Date',

      'eligibility.pageSubtitle': 'Enter your personal and mailing information. RecordPathAI will carry this information into your record details and packet generation workflow.',
      'eligibility.notice': 'Important: This page collects your personal and mailing information only. Case details, charge details, court details, and eligibility results are handled in the next steps.',
      'eligibility.sectionCopy': 'This information helps RecordPathAI prepare your packet profile and avoid duplicate entry later.',
      'eligibility.helper.fullName': 'This can be auto-filled from the Ohio landing page.',
      'eligibility.helper.residenceState': 'This is where you live now. It can be different from the case state.',
      'eligibility.helper.caseState': 'This controls which state rules and packet flow should be used.',
      'eligibility.summaryCopy': 'Next, you will enter your case number, court, county, charge, offense level, disposition date, and other record details. The packet page will use all saved information to determine eligibility timing and generate your filing packet.',
      'eligibility.autosave': 'Your intake information saves locally in this browser for the RecordPathAI workflow.',
      'record.pageTitle': 'Enter Your Record Details',
      'record.pageSubtitle': 'Add each offense with the exact charge, statute, court, dates, and case state. RecordPathAI will use this information later on the packet page to determine packet logic, court output, and eligibility handling.',
      'record.notice': 'Important: The case state is the state where the case was filed. If you live in Nevada but the case is in Ohio, choose Ohio for that offense.',
      'record.note': 'This page stores case data only. Eligibility results should be shown on packet.html, not here.',
      'record.helper.dischargeDate': 'Use the final discharge, release, or probation completion date when applicable.',
      'packet.subtitle': 'Review your saved intake and record details, see the eligibility screening result, and generate the packet tied to the court where the case was actually filed.',
      'packet.screeningNote': 'This is a screening result, not legal advice. Final approval depends on the court.',
      'packet.offensesSubtitle': 'The packet and eligibility banner above use the current selected record. This section shows every saved offense currently in your flow.',
      'packet.missingInfoHelp': 'Please provide the required fields below so your form can be generated.',
      'packet.signatureDraw': 'Or draw your signature below',
      'packet.loadingFiling': 'Loading filing instructions...',
      'packet.footerNote': 'RecordPathAI prepares court-ready documents. It does not file directly with the court and is not a law firm. You can use an e-filing-ready packet with your court integration partner.',

      'record.offense': 'Offense',
      'record.remove': 'Remove',
      'record.addOffense': 'Add Offense',
      'record.savedOffenses': 'Saved Offenses',
      'record.continue': 'Continue to Packet',
      'record.caseNumber': 'Case Number',
      'record.dischargeClosed': 'Discharge / Case Closed Date',
      'record.status.one': '1 offense added',
      'record.status.many': '{count} offenses added',
      'packet.intakeSummary': 'Intake Summary',
      'packet.person': 'Person',
      'packet.name': 'Name',
      'packet.email': 'Email',
      'packet.phone': 'Phone',
      'packet.address': 'Address',
      'packet.residenceState': 'Residence State',
      'packet.selectedRecord': 'Selected Record',
      'packet.caseState': 'Case State',
      'packet.charge': 'Charge',
      'packet.offenseCode': 'Offense Code',
      'packet.level': 'Level',
      'packet.outcome': 'Outcome',
      'packet.dispositionDate': 'Disposition Date',
      'packet.court': 'Court',
      'packet.county': 'County',
      'packet.allSavedOffenses': 'All Saved Offenses',
      'packet.currentRecord': 'Current packet record',
      'packet.generate': 'Generate Packet',
      'packet.useTyped': 'Use Typed Signature',
      'packet.clearSignature': 'Clear Signature',
      'packet.useDrawn': 'Use Drawn Signature',
      'packet.clearPad': 'Clear Pad',
      'packet.generatePdf': 'Generate PDF Packet',
      'packet.testPdf': 'Test PDF Access',
      'packet.openPdf': 'Open Source PDF',
      'packet.unlock': 'Unlock Packet — $50',
      'packet.unlocked': 'Packet unlocked',
      'common.back': 'Back',
      'common.select': 'Select',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.notes': 'Notes',
      'common.finish': 'Finish',
      'record.chargeNamePlaceholder': 'Charge name',
      'record.statuteCodePlaceholder': 'Statute code',
      'record.caseNumberPlaceholder': 'Case number',
      'record.arrestOffenseDate': 'Arrest / Offense Date',
      'record.judgeName': 'Judge Name',
      'record.judgeNamePlaceholder': 'Judge name',
      'record.caseState': 'Case State',
      'record.arrestingAgency': 'Arresting Agency',
      'record.arrestingAgencyPlaceholder': 'Arresting agency',
      'record.prosecutorAgency': 'Prosecutor / Filing Agency',
      'record.prosecutorAgencyPlaceholder': 'Prosecutor or filing agency',
      'record.dispositionFlags': 'Disposition Flags',
      'record.pendingChargesOpenCase': 'Pending charges or open case',
      'record.trafficOffense': 'Traffic offense',
      'record.flaggedOffenseQuestions': 'Flagged Offense Questions',
      'record.flag.theftInOffice': 'Theft in office',
      'record.flag.firstSecondDegreeFelony': '1st or 2nd degree felony',
      'record.flag.sexOffenseRegistryRelated': 'Sex offense registry related',
      'record.flag.victimUnder13': 'Victim under 13',
      'record.flag.felonyViolenceNonSex': 'Felony violence offense (non-sex)',
      'record.flag.domesticViolenceConviction': 'Domestic violence conviction',
      'record.flag.dvMisdemeanorSealable': 'Domestic violence misdemeanor sealable',
      'record.flag.crimeAgainstChild': 'Crime against child',
      'record.flag.sexOffense': 'Sex offense',
      'record.flag.felonyDui': 'Felony DUI',
      'record.flag.homeInvasionDeadlyWeapon': 'Home invasion with deadly weapon',
      'record.totalFeloniesOnRecord': 'Total Felonies on Record',
      'record.totalF3Felonies': 'Total F3 Felonies',
      'record.numberPlaceholder': '0',
      'record.nevadaCategory': 'Nevada Category',
      'record.nv.standardMisdemeanor': 'Standard misdemeanor',
      'record.nv.listedMisdemeanor': 'Listed misdemeanor',
      'record.nv.duiOrDv': 'DUI or domestic violence',
      'record.nv.felony': 'Felony',
      'record.nv.violentCategoryA': 'Violent or Category A',
      'record.arizonaClass': 'Arizona Class',
      'record.az.class2Felony': 'Class 2 felony',
      'record.az.class3Felony': 'Class 3 felony',
      'record.az.class4Felony': 'Class 4 felony',
      'record.az.class5Felony': 'Class 5 felony',
      'record.az.class6Felony': 'Class 6 felony',
      'record.az.class1Misdemeanor': 'Class 1 misdemeanor',
      'record.az.class2Misdemeanor': 'Class 2 misdemeanor',
      'record.az.class3Misdemeanor': 'Class 3 misdemeanor',
      'record.californiaReliefTrack': 'California Relief Track',
      'record.californiaNoProbation': 'California No Probation',
      'record.notesPlaceholder': 'Add anything important about this offense, filing track, or special facts.',
      'record.disposition.convicted': 'Convicted',
      'record.disposition.dismissed': 'Dismissed',
      'record.disposition.notGuilty': 'Not Guilty',
      'record.disposition.acquitted': 'Acquitted',
      'record.disposition.noBill': 'No Bill',
      'record.disposition.pardon': 'Pardon',
      'record.disposition.interventionInLieu': 'Intervention in Lieu',
      'packet.disclaimerPurchase': 'By purchasing, you agree that RecordPathAI provides document preparation services only and does not offer legal advice. All sales are final.',
      'packet.nextStep': 'Next Step: File Your Packet',
      'packet.missingInfo': 'Missing Information',
      'packet.ready': 'Ready.'
      ,'packet.eligibilityNeedsReview': 'Eligibility Needs Review'
      ,'packet.checkingEligibility': 'Checking your eligibility...'
      ,'packet.reviewingCaseStateData': 'We are reviewing the case-state data you entered.'
      ,'packet.reviewingTemplate': 'Reviewing which packet template should be used for this case.'
      ,'packet.lockedWarning': 'Packet is locked until payment is complete. Your eligibility summary and filing checklist remain visible.'
      ,'packet.typedSignaturePlaceholder': 'Typed signature name'
      ,'packet.efilingChecklistTitle': 'E-Filing Readiness Checklist (Franklin County)'
      ,'packet.noSavedOffensesFound': 'No saved offenses found.'
      ,'packet.addAtLeastOneOffense': 'Go back to Record Details and add at least one offense.'
      ,'packet.unnamedOffense': 'Unnamed offense'
      ,'packet.savedRecord': 'Saved record'
      ,'packet.statute': 'Statute'
      ,'packet.degree': 'Degree'
      ,'packet.ohioExpungement': 'Ohio expungement'
      ,'packet.ohioRecordSealing': 'Ohio record sealing'
      ,'packet.needsReview': 'Needs review'
      ,'packet.yearsLabel': '{years} years'
      ,'packet.lessThanOneYear': 'Less than 1 year'
      ,'packet.eligibleNow': 'Eligible now',
      'packet.eligibilityUnclearWarning': 'Eligibility may be unclear. You can continue reviewing packet options, but you may need legal or court guidance before filing.',
      'packet.reminder.title': 'Not Yet Eligible',
      'packet.reminder.message': 'You may not be eligible yet based on the information provided. Save a reminder so you know when to come back.',
      'packet.reminder.save': 'Save Eligibility Reminder',
      'packet.reminder.download': 'Download Reminder',
      'packet.reminder.localNote': 'Reminder data is stored locally on your device.',
      'packet.reminder.saved': 'Reminder saved successfully.',
      'packet.reminder.notYetEligibleCallout': 'You are not yet eligible based on this screening. Save a reminder and return when your estimated eligibility date is reached.'
      ,'packet.screeningNeedsReview': 'Screening needs review'
      ,'packet.likelyEligible': 'Likely Eligible'
      ,'packet.screeningResultForCase': 'Screening result for {state} case'
      ,'packet.thisCase': 'this'
      ,'packet.pdfMapperLoaded': 'PDF mapper loaded.'
      ,'packet.templateLabel': 'Template'
      ,'packet.mappingJsonLabel': 'Mapping JSON'
      ,'packet.sourcePdfLabel': 'Source PDF'
      ,'packet.mappedFieldsLabel': 'Mapped fields'
      ,'packet.paymentReceivedUnlocked': 'Payment received. Packet unlocked.'
      ,'packet.unlockedReadyGenerate': 'Packet unlocked. You can now generate your court-ready packet.'
      ,'packet.paymentCancelledSaved': 'Payment cancelled. Your data is saved.'
      ,'packet.paymentCancelledLocked': 'Payment cancelled. Your packet remains locked.'
      ,'packet.lockedUntilPayment': 'Packet locked until payment is complete.'
      ,'packet.flag.missingDischargeDate': 'Missing discharge date'
      ,'packet.flag.f1f2': 'F1/F2 disqualifying level'
      ,'packet.flag.pendingCharges': 'Pending charges'
      ,'packet.flag.trafficOffense': 'Traffic offense'
      ,'packet.flag.firstSecondDegreeFelony': '1st/2nd degree felony'
      ,'packet.flag.threePlusF3': '3+ F3 felonies'
      ,'packet.flag.domesticViolence': 'domestic violence'
      ,'packet.flag.sexRegistry': 'sex offense registry'
      ,'packet.flag.victimUnder13': 'victim under 13'
      ,'packet.flag.felonyViolence': 'felony violence offense'
      ,'packet.waitingPeriodSatisfiedSavedData': 'Waiting period appears satisfied based on saved case data.'
      ,'packet.finalDischargeMissing': 'Final discharge date is missing.'
      ,'packet.f1f2ManualReview': 'F1/F2 convictions require manual review and may be disqualifying.'
      ,'packet.threeYears': '3 years'
      ,'packet.waitingPeriodAppearsSatisfied': 'Waiting period appears satisfied.'
      ,'packet.waitingPeriodNotSatisfied': 'Waiting period is not yet satisfied.'
      ,'packet.needsReviewMissingDischarge': 'Needs review: missing final discharge date, so an estimated eligibility date cannot be calculated.'
      ,'packet.needsReviewF1F2Detected': 'Needs review: F1/F2 disqualifying level detected for this Ohio case.'
      ,'packet.waitingPeriodSatisfiedFlagsMayAffect': 'Waiting period appears satisfied, but one or more screening flags may affect eligibility.'
      ,'packet.waitingSatisfiedNoFlags': 'The waiting period appears satisfied with no disqualifying screening flags.'
      ,'packet.reviewChecklistBeforeFiling': 'Review the checklist below before filing.'

    },
    es: {
      'lang.label': 'Acceso de idioma',
      'lang.english': 'English',
      'lang.spanish': 'Español',
      'translation.disclaimer': 'La traducción se proporciona para conveniencia y puede no reemplazar los servicios oficiales de traducción del tribunal.',
      'nav.home': 'Inicio',
      'nav.how': 'Cómo funciona',
      'nav.eligibility': 'Elegibilidad',
      'nav.recordDetails': 'Detalles del registro',
      'nav.packet': 'Paquete',
      'nav.checkEligibility': 'Verificar elegibilidad gratis',

      'index.hero.title': 'Alivio de antecedentes judiciales, automatizado.',
      'index.hero.seeHow': 'Ver cómo funciona',
      'how.title': 'Cómo funciona',
      'eligibility.title': 'Formulario de elegibilidad',
      'record.title': 'Detalles del registro',
      'packet.title': 'Su paquete de presentación',

      'index.eyebrow': 'Automatización de documentos judiciales',
      'index.hero.copy': 'Verifique su elegibilidad gratis, ingrese los detalles de su caso, genere un paquete de presentación listo para la corte cuando sea elegible y complete el pago seguro en línea.',
      'index.trust': 'Verificaciones de elegibilidad gratis. El pago seguro en línea ya está activo.',
      'index.workflow': 'Flujo de RecordPathAI',
      'index.packetBuilder': 'Constructor de Paquete Judicial',
      'index.status.ready': 'Listo',
      'index.progress.pdf': 'Paquete PDF',
      'index.progress.packet': 'Paquete',
      'index.progress.payment': 'Pago',
      'index.caseState': 'Estado del caso',
      'index.county': 'Condado',
      'index.selectedCourtForm': 'Formulario judicial seleccionado',
      'index.pdfGenerated': 'PDF generado',
      'index.mappedFields': '33 campos mapeados completados',
      'index.problem.title': 'El problema',
      'index.problem.copy': 'El alivio de antecedentes es confuso, fragmentado y específico de cada tribunal.',
      'index.solution.title': 'La solución',
      'index.solution.copy': 'RecordPathAI convierte la información del usuario en datos estructurados y genera paquetes de presentación específicos del tribunal.',
      'index.how.1.title': '1. Verificación de elegibilidad gratis',
      'index.how.1.copy': 'Responda preguntas sobre su antecedente y su estado para determinar posible elegibilidad.',
      'index.how.2.title': '2. Detalles del registro',
      'index.how.2.copy': 'Ingrese cargos, tribunales, fechas, resultados e información específica del caso.',
      'index.how.3.title': '3. Paquete y pago',
      'index.how.3.copy': 'Genere su paquete de presentación listo para la corte y complete el pago seguro en línea.',
      'index.built.title': 'Creado para el acceso del consumidor. Diseñado para integración con tecnología judicial.',
      'index.consumer.title': 'Puerta de entrada para consumidores',
      'index.consumer.copy': 'Ayuda a los usuarios a comenzar antes de llegar a los sistemas judiciales.',
      'index.structured.title': 'Datos legales estructurados',
      'index.structured.copy': 'Convierte información desordenada del expediente en datos estandarizados para el paquete.',
      'index.future.title': 'Potencial B2B futuro',
      'index.future.copy': 'Puede integrarse con tribunales, asistencia legal y plataformas de gestión de casos.',
      'index.capability.title': 'Capacidad actual',
      'index.now.title': 'Lo que RecordPathAI hace ahora',
      'index.now.1': 'Verificación de elegibilidad gratis',
      'index.now.2': 'Captura detalles del caso y del delito',
      'index.now.3': 'Determina la ruta del paquete según el estado del caso',
      'index.now.4': 'Genera paquetes PDF mapeados e imprimibles',
      'index.now.5': 'Procesa pagos seguros en línea',
      'index.next.title': 'Hoja de ruta',
      'index.next.1': 'Cobertura judicial ampliada',
      'index.next.2': 'Integraciones de presentación electrónica judicial',
      'index.next.3': 'Recuperación automatizada de formularios',
      'index.next.4': 'Integraciones con plataformas de gestión de casos',
      'index.cta.title': 'Comience con su verificación de elegibilidad gratis.',
      'footer.copy': 'Flujo guiado de alivio de antecedentes y preparación de paquetes judiciales.',
      'footer.legal': 'RecordPathAI no es un bufete de abogados y no brinda asesoría legal. Los documentos se generan según la información del usuario y formularios disponibles públicamente.',
      'footer.terms': 'Términos',
      'footer.privacy': 'Privacidad',
      'footer.disclaimer': 'Descargo de responsabilidad',
      'eligibility.eyebrow': 'Paso 1 del flujo de trabajo',
      'eligibility.pageTitle': 'Comience su formulario de elegibilidad',
      'eligibility.contact.title': 'Su información de contacto',
      'eligibility.firstName': 'Nombre',
      'eligibility.lastName': 'Apellido',
      'eligibility.fullName': 'Nombre legal completo',
      'eligibility.email': 'Correo electrónico',
      'eligibility.phone': 'Teléfono',
      'eligibility.address1': 'Dirección',
      'eligibility.address2': 'Apartamento / Unidad',
      'eligibility.city': 'Ciudad',
      'eligibility.residenceState': 'Estado de residencia',
      'eligibility.zip': 'Código postal',
      'eligibility.notes': 'Notas opcionales',
      'eligibility.save': 'Guardar formulario',
      'eligibility.continue': 'Guardar y continuar',
      'eligibility.next.title': 'Qué sucede después',

      'how.eyebrow': 'Paso 1 · De formulario a ruta de presentación',
      'record.eyebrow': 'Paso 2 del flujo de trabajo',
      'packet.eyebrow': 'Paso 3 del flujo de trabajo',
      'packet.eligibilityStatus': 'Estado de elegibilidad',
      'packet.reliefType': 'Tipo de alivio',
      'packet.dischargeDate': 'Fecha de finalización de sentencia',
      'packet.waitingPeriod': 'Período de espera requerido',
      'packet.estimatedEligibleDate': 'Fecha estimada de elegibilidad',

      'eligibility.pageSubtitle': 'Ingrese su información personal y postal. RecordPathAI usará esta información en los detalles del expediente y en la generación del paquete.',
      'eligibility.notice': 'Importante: esta página recopila solo su información personal y postal. Los detalles del caso, cargos, tribunal y resultados de elegibilidad se manejan en los siguientes pasos.',
      'eligibility.sectionCopy': 'Esta información ayuda a RecordPathAI a preparar su perfil del paquete y evitar ingresar datos duplicados más adelante.',
      'eligibility.helper.fullName': 'Esto puede completarse automáticamente desde la página inicial de Ohio.',
      'eligibility.helper.residenceState': 'Este es el estado donde vive ahora. Puede ser distinto del estado del caso.',
      'eligibility.helper.caseState': 'Esto controla qué reglas estatales y flujo de paquete deben usarse.',
      'eligibility.summaryCopy': 'Después, ingresará su número de caso, tribunal, condado, cargo, nivel del delito, fecha de resolución y otros detalles del expediente. La página del paquete usará toda la información guardada para calcular tiempos de elegibilidad y generar su paquete de presentación.',
      'eligibility.autosave': 'La información de su formulario se guarda localmente en este navegador para el flujo de RecordPathAI.',
      'record.pageTitle': 'Ingrese los detalles de su expediente',
      'record.pageSubtitle': 'Agregue cada delito con el cargo exacto, estatuto, tribunal, fechas y estado del caso. RecordPathAI usará esta información más adelante en la página del paquete para determinar la lógica del paquete, la salida judicial y el manejo de elegibilidad.',
      'record.notice': 'Importante: el estado del caso es el estado donde se presentó el caso. Si vive en Nevada pero el caso es en Ohio, elija Ohio para ese delito.',
      'record.note': 'Esta página solo almacena datos del caso. Los resultados de elegibilidad deben mostrarse en packet.html, no aquí.',
      'record.helper.dischargeDate': 'Use la fecha final de cumplimiento, liberación o finalización de libertad condicional cuando corresponda.',
      'packet.subtitle': 'Revise su información guardada y los detalles del expediente, vea el resultado de evaluación de elegibilidad y genere el paquete vinculado al tribunal donde realmente se presentó el caso.',
      'packet.screeningNote': 'Este es un resultado de evaluación, no asesoría legal. La aprobación final depende del tribunal.',
      'packet.offensesSubtitle': 'El paquete y el aviso de elegibilidad de arriba usan el expediente seleccionado actual. Esta sección muestra todos los delitos guardados en su flujo.',
      'packet.missingInfoHelp': 'Proporcione los campos obligatorios a continuación para que se pueda generar su formulario.',
      'packet.signatureDraw': 'O dibuje su firma abajo',
      'packet.loadingFiling': 'Cargando instrucciones de presentación...',
      'packet.footerNote': 'RecordPathAI prepara documentos listos para el tribunal. No presenta directamente ante el tribunal y no es un bufete de abogados. Puede usar un paquete listo para presentación electrónica con su socio de integración judicial.',

      'record.offense': 'Delito',
      'record.remove': 'Eliminar',
      'record.addOffense': 'Agregar delito',
      'record.savedOffenses': 'Delitos guardados',
      'record.continue': 'Continuar al paquete',
      'record.caseNumber': 'Número de caso',
      'record.dischargeClosed': 'Fecha de cierre del caso / finalización',
      'record.status.one': '1 delito agregado',
      'record.status.many': '{count} delitos agregados',
      'packet.intakeSummary': 'Resumen de admisión',
      'packet.person': 'Persona',
      'packet.name': 'Nombre',
      'packet.email': 'Correo electrónico',
      'packet.phone': 'Teléfono',
      'packet.address': 'Dirección',
      'packet.residenceState': 'Estado de residencia',
      'packet.selectedRecord': 'Registro seleccionado',
      'packet.caseState': 'Estado del caso',
      'packet.charge': 'Cargo',
      'packet.offenseCode': 'Código de delito',
      'packet.level': 'Nivel',
      'packet.outcome': 'Resultado',
      'packet.dispositionDate': 'Fecha de resolución',
      'packet.court': 'Tribunal',
      'packet.county': 'Condado',
      'packet.allSavedOffenses': 'Todos los delitos guardados',
      'packet.currentRecord': 'Registro actual del paquete',
      'packet.generate': 'Generar paquete',
      'packet.useTyped': 'Usar firma escrita',
      'packet.clearSignature': 'Borrar firma',
      'packet.useDrawn': 'Usar firma dibujada',
      'packet.clearPad': 'Borrar panel',
      'packet.generatePdf': 'Generar paquete PDF',
      'packet.testPdf': 'Probar acceso al PDF',
      'packet.openPdf': 'Abrir PDF fuente',
      'packet.unlock': 'Desbloquear paquete — $50',
      'packet.unlocked': 'Paquete desbloqueado',
      'common.back': 'Atrás',
      'common.select': 'Seleccionar',
      'common.yes': 'Sí',
      'common.no': 'No',
      'common.notes': 'Notas',
      'common.finish': 'Finalizar',
      'record.chargeNamePlaceholder': 'Nombre del cargo',
      'record.statuteCodePlaceholder': 'Código del estatuto',
      'record.caseNumberPlaceholder': 'Número de caso',
      'record.arrestOffenseDate': 'Fecha de arresto / delito',
      'record.judgeName': 'Nombre del juez',
      'record.judgeNamePlaceholder': 'Nombre del juez',
      'record.caseState': 'Estado del caso',
      'record.arrestingAgency': 'Agencia de arresto',
      'record.arrestingAgencyPlaceholder': 'Agencia de arresto',
      'record.prosecutorAgency': 'Fiscal / agencia que presentó',
      'record.prosecutorAgencyPlaceholder': 'Fiscal o agencia que presentó',
      'record.dispositionFlags': 'Indicadores de resolución',
      'record.pendingChargesOpenCase': 'Cargos pendientes o caso abierto',
      'record.trafficOffense': 'Delito de tránsito',
      'record.flaggedOffenseQuestions': 'Preguntas de delitos señalados',
      'record.flag.theftInOffice': 'Robo en cargo público',
      'record.flag.firstSecondDegreeFelony': 'Delito grave de 1.º o 2.º grado',
      'record.flag.sexOffenseRegistryRelated': 'Relacionado con registro de delitos sexuales',
      'record.flag.victimUnder13': 'Víctima menor de 13 años',
      'record.flag.felonyViolenceNonSex': 'Delito grave violento (no sexual)',
      'record.flag.domesticViolenceConviction': 'Condena por violencia doméstica',
      'record.flag.dvMisdemeanorSealable': 'Delito menor de violencia doméstica sellable',
      'record.flag.crimeAgainstChild': 'Delito contra un menor',
      'record.flag.sexOffense': 'Delito sexual',
      'record.flag.felonyDui': 'DUI grave',
      'record.flag.homeInvasionDeadlyWeapon': 'Allanamiento de morada con arma mortal',
      'record.totalFeloniesOnRecord': 'Total de delitos graves en el expediente',
      'record.totalF3Felonies': 'Total de delitos graves F3',
      'record.numberPlaceholder': '0',
      'record.nevadaCategory': 'Categoría de Nevada',
      'record.nv.standardMisdemeanor': 'Delito menor estándar',
      'record.nv.listedMisdemeanor': 'Delito menor listado',
      'record.nv.duiOrDv': 'DUI o violencia doméstica',
      'record.nv.felony': 'Delito grave',
      'record.nv.violentCategoryA': 'Violento o categoría A',
      'record.arizonaClass': 'Clase de Arizona',
      'record.az.class2Felony': 'Delito grave de clase 2',
      'record.az.class3Felony': 'Delito grave de clase 3',
      'record.az.class4Felony': 'Delito grave de clase 4',
      'record.az.class5Felony': 'Delito grave de clase 5',
      'record.az.class6Felony': 'Delito grave de clase 6',
      'record.az.class1Misdemeanor': 'Delito menor de clase 1',
      'record.az.class2Misdemeanor': 'Delito menor de clase 2',
      'record.az.class3Misdemeanor': 'Delito menor de clase 3',
      'record.californiaReliefTrack': 'Ruta de alivio de California',
      'record.californiaNoProbation': 'California sin libertad condicional',
      'record.notesPlaceholder': 'Agregue cualquier dato importante sobre este delito, la vía de presentación o hechos especiales.',
      'record.disposition.convicted': 'Condenado',
      'record.disposition.dismissed': 'Desestimado',
      'record.disposition.notGuilty': 'No culpable',
      'record.disposition.acquitted': 'Absuelto',
      'record.disposition.noBill': 'No procede',
      'record.disposition.pardon': 'Indulto',
      'record.disposition.interventionInLieu': 'Intervención en lugar de condena',
      'packet.disclaimerPurchase': 'Al comprar, usted acepta que RecordPathAI solo brinda servicios de preparación de documentos y no ofrece asesoría legal. Todas las ventas son finales.',
      'packet.nextStep': 'Siguiente paso: presente su paquete',
      'packet.missingInfo': 'Información faltante',
      'packet.ready': 'Listo.'
      ,'packet.eligibilityNeedsReview': 'La elegibilidad necesita revisión'
      ,'packet.checkingEligibility': 'Verificando su elegibilidad...'
      ,'packet.reviewingCaseStateData': 'Estamos revisando los datos del estado del caso que ingresó.'
      ,'packet.reviewingTemplate': 'Revisando qué plantilla de paquete debe usarse para este caso.'
      ,'packet.lockedWarning': 'El paquete está bloqueado hasta que se complete el pago. Su resumen de elegibilidad y la lista de verificación siguen visibles.'
      ,'packet.typedSignaturePlaceholder': 'Nombre de firma escrita'
      ,'packet.efilingChecklistTitle': 'Lista de preparación para presentación electrónica (Condado de Franklin)'
      ,'packet.noSavedOffensesFound': 'No se encontraron delitos guardados.'
      ,'packet.addAtLeastOneOffense': 'Regrese a Detalles del registro y agregue al menos un delito.'
      ,'packet.unnamedOffense': 'Delito sin nombre'
      ,'packet.savedRecord': 'Registro guardado'
      ,'packet.statute': 'Estatuto'
      ,'packet.degree': 'Grado'
      ,'packet.ohioExpungement': 'Eliminación de antecedentes de Ohio'
      ,'packet.ohioRecordSealing': 'Sellado de antecedentes de Ohio'
      ,'packet.needsReview': 'Necesita revisión'
      ,'packet.yearsLabel': '{years} años'
      ,'packet.lessThanOneYear': 'Menos de 1 año'
      ,'packet.eligibleNow': 'Elegible ahora',
      'packet.eligibilityUnclearWarning': 'La elegibilidad puede ser incierta. Puede continuar revisando opciones de paquete, pero podría necesitar orientación legal o del tribunal antes de presentar.',
      'packet.reminder.title': 'Aún no elegible',
      'packet.reminder.message': 'Es posible que aún no sea elegible según la información proporcionada. Guarde un recordatorio para saber cuándo volver.',
      'packet.reminder.save': 'Guardar recordatorio de elegibilidad',
      'packet.reminder.download': 'Descargar recordatorio',
      'packet.reminder.localNote': 'Los datos del recordatorio se guardan localmente en su dispositivo.',
      'packet.reminder.saved': 'Recordatorio guardado correctamente.',
      'packet.reminder.notYetEligibleCallout': 'Aún no es elegible según esta evaluación. Guarde un recordatorio y vuelva cuando llegue su fecha estimada de elegibilidad.'
      ,'packet.screeningNeedsReview': 'La evaluación necesita revisión'
      ,'packet.likelyEligible': 'Probablemente elegible'
      ,'packet.screeningResultForCase': 'Resultado de evaluación para caso de {state}'
      ,'packet.thisCase': 'este'
      ,'packet.pdfMapperLoaded': 'Mapeador PDF cargado.'
      ,'packet.templateLabel': 'Plantilla'
      ,'packet.mappingJsonLabel': 'JSON de mapeo'
      ,'packet.sourcePdfLabel': 'PDF fuente'
      ,'packet.mappedFieldsLabel': 'Campos mapeados'
      ,'packet.paymentReceivedUnlocked': 'Pago recibido. Paquete desbloqueado.'
      ,'packet.unlockedReadyGenerate': 'Paquete desbloqueado. Ahora puede generar su paquete listo para la corte.'
      ,'packet.paymentCancelledSaved': 'Pago cancelado. Sus datos están guardados.'
      ,'packet.paymentCancelledLocked': 'Pago cancelado. Su paquete permanece bloqueado.'
      ,'packet.lockedUntilPayment': 'Paquete bloqueado hasta que se complete el pago.'
      ,'packet.flag.missingDischargeDate': 'Falta la fecha de finalización'
      ,'packet.flag.f1f2': 'Nivel descalificante F1/F2'
      ,'packet.flag.pendingCharges': 'Cargos pendientes'
      ,'packet.flag.trafficOffense': 'Delito de tránsito'
      ,'packet.flag.firstSecondDegreeFelony': 'Delito grave de 1.º/2.º grado'
      ,'packet.flag.threePlusF3': '3+ delitos graves F3'
      ,'packet.flag.domesticViolence': 'violencia doméstica'
      ,'packet.flag.sexRegistry': 'registro de delitos sexuales'
      ,'packet.flag.victimUnder13': 'víctima menor de 13'
      ,'packet.flag.felonyViolence': 'delito grave violento'
      ,'packet.waitingPeriodSatisfiedSavedData': 'El período de espera parece cumplido según los datos guardados del caso.'
      ,'packet.finalDischargeMissing': 'Falta la fecha final de cumplimiento.'
      ,'packet.f1f2ManualReview': 'Las condenas F1/F2 requieren revisión manual y pueden ser descalificantes.'
      ,'packet.threeYears': '3 años'
      ,'packet.waitingPeriodAppearsSatisfied': 'El período de espera parece cumplido.'
      ,'packet.waitingPeriodNotSatisfied': 'El período de espera aún no se cumple.'
      ,'packet.needsReviewMissingDischarge': 'Necesita revisión: falta la fecha final de cumplimiento, por lo que no se puede calcular una fecha estimada de elegibilidad.'
      ,'packet.needsReviewF1F2Detected': 'Necesita revisión: se detectó nivel descalificante F1/F2 para este caso de Ohio.'
      ,'packet.waitingPeriodSatisfiedFlagsMayAffect': 'El período de espera parece cumplido, pero una o más señales de evaluación pueden afectar la elegibilidad.'
      ,'packet.waitingSatisfiedNoFlags': 'El período de espera parece cumplido sin señales descalificantes en la evaluación.'
      ,'packet.reviewChecklistBeforeFiling': 'Revise la lista de verificación antes de presentar.'

    }
  };

  function getLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || DEFAULT_LANG;
    return dictionary[stored] ? stored : DEFAULT_LANG;
  }

  function setLanguage(lang) {
    const next = dictionary[lang] ? lang : DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
  }

  function translateNode(node, lang, keyAttr = 'data-i18n', targetAttr = null) {
    const key = node.getAttribute(keyAttr);
    const attr = targetAttr || node.getAttribute('data-i18n-attr');
    const value = dictionary[lang] && dictionary[lang][key];
    if (!value) return;
    if (attr) node.setAttribute(attr, value);
    else node.textContent = value;
  }

  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((node) => translateNode(node, lang));
    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => translateNode(node, lang, 'data-i18n-placeholder', 'placeholder'));
    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => translateNode(node, lang, 'data-i18n-aria-label', 'aria-label'));
    const selector = document.querySelector('[data-language-selector]');
    if (selector) selector.value = lang;
  }
  function t(key) {
    const lang = getLanguage();
    return (dictionary[lang] && dictionary[lang][key]) || (dictionary.en && dictionary.en[key]) || key;
  }
  window.RecordPathI18n = { getLanguage, setLanguage, applyLanguage, t };

  document.addEventListener('DOMContentLoaded', function () {
    const selector = document.querySelector('[data-language-selector]');
    if (selector) {
      selector.addEventListener('change', function (event) {
        setLanguage(event.target.value);
      });
    }
    applyLanguage(getLanguage());
  });
})();
