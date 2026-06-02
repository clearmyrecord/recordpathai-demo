(function () {
  "use strict";

  const STORAGE_KEY = "recordpathai_language";
  const LEGACY_STORAGE_KEYS = ["recordpathai.lang", "recordPathLanguage", "language"];
  const DEFAULT_LANG = "en";
  const supportedLanguages = ["en", "es"];
  const missingKeys = new Set();

  const en = {
    common: {
      brand: "RecordPathAI",
      loading: "Loading...",
      unavailable: "Not available",
      none: "None",
      yes: "Yes",
      no: "No",
      active: "Active",
      inactive: "Inactive",
      status: "Status",
      state: "State",
      county: "County",
      court: "Court",
      email: "Email",
      phone: "Phone",
      name: "Name",
      created: "Created",
      updated: "Updated",
      total: "Total",
      date: "Date",
      type: "Type",
      amount: "Amount",
      description: "Description",
      eligibility: "Eligibility",
      caseNumber: "Case Number",
      charge: "Charge",
      offense: "Offense",
      statute: "Statute",
      degree: "Degree",
      outcome: "Outcome",
      dispositionDate: "Disposition Date",
      dischargeDate: "Discharge Date",
      sentenceCompletionDate: "Sentence Completion Date",
      probationCompletionDate: "Probation Completion Date",
      arrestDate: "Arrest Date",
      offenseDate: "Offense Date",
      judge: "Judge",
      prosecutor: "Prosecutor",
      defenseAttorney: "Defense Attorney",
      bookingNumber: "Booking Number",
      arrestingAgency: "Arresting Agency",
      detentionFacility: "Detention Facility"
    },
    lang: {
      label: "Language Access",
      english: "English",
      spanish: "Español"
    },
    translation: {
      disclaimer: "Translation is provided for convenience and may not replace official court translation services."
    },
    nav: {
      home: "Home",
      how: "How It Works",
      eligibility: "Eligibility",
      recordDetails: "Record Details",
      packetGeneration: "Packet Generation",
      recordWatch: "RecordWatch",
      courtAccess: "Court Access",
      packet: "Packet",
      dashboard: "Dashboard",
      account: "Account",
      login: "Login",
      logout: "Logout",
      createAccount: "Create Account",
      checkEligibility: "Start Free Eligibility Check"
    },
    footer: {
      copy: "Guided record relief workflow and court packet preparation.",
      legal: "RecordPathAI is not a law firm and does not provide legal advice. Documents are generated based on user input and publicly available forms.",
      terms: "Terms",
      privacy: "Privacy",
      disclaimer: "Disclaimer"
    },
    buttons: {
      continue: "Continue",
      back: "Back",
      finish: "Finish",
      save: "Save",
      delete: "Delete",
      remove: "Remove",
      resume: "Resume",
      cancel: "Cancel",
      submit: "Submit",
      start: "Start",
      import: "Import",
      notNow: "Not now",
      clearPad: "Clear Pad",
      useDrawnSignature: "Use Drawn Signature",
      generatePacket: "Generate Packet",
      payGeneratePacket: "Pay $50 & Generate Packet",
      activateRecordWatch: "Activate RecordWatch",
      startMonthly: "Start Monthly",
      saveAnnual: "Save with Annual",
      cancelSubscription: "Cancel Subscription",
      openPacket: "Open Packet",
      openRecordWatch: "Open RecordWatch",
      editRecordDetails: "Edit Record Details",
      saveAccount: "Save Account",
      saveNotificationPreferences: "Save Notification Preferences"
    },
    forms: {
      fullName: "Full name",
      firstName: "First name",
      lastName: "Last name",
      address: "Address",
      address1: "Address line 1",
      address2: "Address line 2",
      city: "City",
      zip: "ZIP code",
      password: "Password",
      emailPlaceholder: "you@example.com",
      optional: "Optional",
      selectState: "Select state",
      phonePlaceholder: "Phone number"
    },
    auth: {
      loginTitle: "Log in",
      signupTitle: "Create Account",
      importTitle: "Import demo data?",
      importPrompt: "We found previous browser-only RecordPathAI data. Import it into this Supabase account?",
      importing: "Importing…",
      importedCases: "Imported {count} case(s).",
      signInRequired: "Sign in to continue.",
      signInBeforeAccount: "Sign in before updating account details.",
      accountNotFound: "Current Supabase account was not found."
    },
    home: {
      heroTitle: "Court record relief, automated.",
      heroCta: "See How It Works",
      eyebrow: "Court document automation",
      heroCopy: "Check your eligibility for free, enter your case details, generate a court-ready filing packet when eligible, and complete secure online payment online.",
      trust: "Free eligibility checks. Secure online payment is now live.",
      workflow: "RecordPathAI Workflow",
      problemTitle: "The Problem",
      solutionTitle: "The Solution"
    },
    howItWorks: {
      title: "How It Works"
    },
    eligibility: {
      title: "Eligibility Intake",
      pageSubtitle: "Enter your personal and mailing information. RecordPathAI will carry this information into your record details and packet generation workflow.",
      notice: "Important: This page collects your personal and mailing information only. Case details, charge details, court details, and eligibility results are handled in the next steps.",
      screeningResult: "Screening result for {state}",
      eligibleNow: "Eligible now",
      eligibleOn: "Eligible on {date}",
      notScreened: "Not screened yet",
      moreInfoNeeded: "More information needed"
    },
    recordDetails: {
      title: "Record Details",
      pageTitle: "Enter Your Record Details",
      chargeName: "Charge Name",
      dispositionOutcome: "Disposition / Outcome",
      chargeLevel: "Charge Level",
      offenseNumber: "Offense {number}",
      oneOffenseAdded: "1 offense added",
      offensesAdded: "{count} offenses added",
      searchPrompt: "Enter a court and state to search for the official packet.",
      searchingForms: "Searching official court forms...",
      foundPacket: "Found packet: {title}",
      noPacket: "No official packet found yet.",
      packetSearchError: "Could not find a packet right now.",
      courtPlaceholder: "Example: Wood County Court of Common Pleas",
      countyPlaceholder: "Example: Wood County",
      chargePlaceholder: "Start typing a charge",
      dispositionPlaceholder: "Start typing a disposition",
      levelPlaceholder: "Start typing a level",
      notesPlaceholder: "Anything else about this offense..."
    },
    record: {
      offense: "Offense",
      caseNumber: "Case Number"
    },
    packet: {
      title: "Your Filing Packet",
      generateTitle: "Generate Packet",
      eligibilityStatus: "Eligibility Status",
      reliefType: "Relief Type",
      ohioRecordSealing: "Ohio Record Sealing",
      waitingPeriod: "Required Waiting Period",
      estimatedEligibleDate: "Estimated Eligible Date",
      recordWatchTracking: "RecordWatch background tracking",
      pdfMapperLoaded: "PDF mapper loaded",
      template: "Template",
      mappingJson: "Mapping JSON",
      sourcePdf: "Source PDF",
      mappedFields: "Mapped fields",
      eligibleCheckout: "Eligible now — continue to secure checkout...",
      stateMismatch: "Your residence state and case state are different. Use the case state for court packet rules.",
      drawSignature: "Draw your signature below",
      drawnSignatureSelected: "Drawn signature selected.",
      signatureRequired: "Please draw your signature before generating your packet.",
      addCaseOrCharge: "Add at least one charge or case number.",
      saveBeforeCheckoutFailed: "We could not save your case before checkout.",
      openingCheckout: "Opening secure checkout...",
      checkoutError: "We could not start checkout. Please try again.",
      generationError: "We could not generate your packet. Please review the required fields and try again.",
      offense: "Offense",
      caseNumber: "Case Number",
      statute: "Statute",
      degree: "Degree",
      outcome: "Outcome",
      dispositionDate: "Disposition Date",
      dischargeDate: "Discharge Date",
      court: "Court",
      county: "County",
      currentRecord: "Current packet record",
      savedRecord: "Saved record",
      notGenerated: "Packet: Not generated"
    },
    dashboard: {
      welcome: "Welcome",
      nextAction: "Next Action",
      reviewPacketPayment: "Review packet and payment",
      savedCases: "Saved Cases",
      purchaseLedger: "Purchase Ledger",
      totalPurchases: "Total Purchases",
      creditsRefunds: "Credits / Refunds",
      currentBalance: "Current Balance",
      lastTransaction: "Last Transaction",
      noTransactions: "No transactions yet",
      ledgerEmpty: "Your purchases and credits will appear here once activity is available."
    },
    recordWatch: {
      title: "RecordWatch",
      neverMiss: "Never Miss Your Eligibility Date",
      freeReminders: "Free Eligibility Reminders",
      premium: "Premium RecordWatch",
      smsAlerts: "SMS alerts",
      emailReminders: "Email reminders",
      filingReminders: "Filing reminders",
      courtStatusUpdates: "Court status updates",
      communicationPreferences: "Communication Preferences",
      upcomingAlerts: "Upcoming Alerts",
      reminderHistory: "Reminder History",
      notificationStatus: "Notification Status",
      noReminders: "No reminders yet",
      noAlerts: "No alerts scheduled",
      notActivated: "RecordWatch: Not Activated",
      smsConsent: "I agree to receive SMS eligibility reminders and RecordWatch alerts.",
      stopOptOut: "Reply STOP to opt out of SMS messages at any time.",
      signInSms: "Sign in to manage SMS reminders.",
      premiumRequiredSms: "Premium RecordWatch is required before SMS can be enabled.",
      enterPhoneSms: "Enter a phone number before enabling SMS.",
      checkConsentSms: "Check the SMS consent box before enabling SMS.",
      optedOutSms: "SMS is opted out. Reply START to your SMS provider if supported, then save consent again."
    },
    courtAccess: {
      title: "Court Access",
      onlineFilings: "Online filings",
      filingReview: "Filing review",
      approvals: "Approvals",
      integrations: "Integrations",
      dashboard: "Court dashboard"
    },
    clerk: {
      title: "Clerk Account"
    },
    ledger: {
      empty: "Your purchases and credits will appear here once activity is available."
    },
    savedCases: {
      deleteConfirm: "Delete this saved case? This cannot be undone.",
      notFound: "We could not find that saved case. Please choose another case from your dashboard.",
      updateFailed: "We could not update that saved case.",
      caseNotRemoved: "Case was not removed.",
      noSavedCases: "No saved cases yet."
    },
    account: {
      settings: "Account settings",
      subtitle: "Update your Supabase account profile.",
      metadata: "Account metadata",
      userId: "User ID",
      lastLogin: "Last login",
      notificationPreferences: "Notification Preferences",
      notificationCopy: "Choose how RecordPathAI may contact you about eligibility reminders, packet reminders, and product updates."
    },
    terms: { title: "Terms of Use" },
    privacy: { title: "Privacy Policy" },
    disclaimer: { title: "Disclaimer" },
    errors: {
      invalidJson: "Invalid JSON.",
      searchFailed: "Search failed",
      supabaseClientLoad: "Could not load Supabase client library.",
      supabaseClientInit: "Supabase client library did not initialize.",
      courtFormMissing: "Court form configuration not found.",
      noSavedResult: "No saved result found. Run the calculator first."
    },
    status: {
      completed: "Completed",
      current: "Current",
      locked: "Locked",
      available: "Available",
      notStarted: "Not Started",
      inProgress: "In Progress",
      waiting: "Waiting",
      verifiedCorrected: "Verified Corrected",
      followUpNeeded: "Follow-Up Needed",
      eligible: "Eligible"
    },
    workflow: {
      consumerWorkflow: "Consumer workflow",
      stepsCompleted: "{completed} of {total} steps completed",
      completePrevious: "Complete the previous workflow step first.",
      packetGeneration: "packet generation",
      completeEligibilityBefore: "Complete Check Eligibility before {action}.",
      completeRecordBefore: "Complete Record Details before {action}."
    }
  };

  const es = {
    common: {
      brand: "RecordPathAI",
      loading: "Cargando...",
      unavailable: "No disponible",
      none: "Ninguno",
      yes: "Sí",
      no: "No",
      active: "Activo",
      inactive: "Inactivo",
      status: "Estado",
      state: "Estado",
      county: "Condado",
      court: "Tribunal",
      email: "Correo electrónico",
      phone: "Teléfono",
      name: "Nombre",
      created: "Creado",
      updated: "Actualizado",
      total: "Total",
      date: "Fecha",
      type: "Tipo",
      amount: "Monto",
      description: "Descripción",
      eligibility: "Elegibilidad",
      caseNumber: "Número de caso",
      charge: "Cargo",
      offense: "Delito",
      statute: "Estatuto",
      degree: "Grado",
      outcome: "Resultado",
      dispositionDate: "Fecha de resolución",
      dischargeDate: "Fecha de finalización",
      sentenceCompletionDate: "Fecha de cumplimiento de sentencia",
      probationCompletionDate: "Fecha de finalización de la libertad condicional",
      arrestDate: "Fecha de arresto",
      offenseDate: "Fecha del delito",
      judge: "Juez",
      prosecutor: "Fiscal",
      defenseAttorney: "Abogado defensor",
      bookingNumber: "Número de registro de arresto",
      arrestingAgency: "Agencia que realizó el arresto",
      detentionFacility: "Centro de detención"
    },
    lang: { label: "Acceso de idioma", english: "English", spanish: "Español" },
    translation: { disclaimer: "La traducción se ofrece para su conveniencia y no reemplaza los servicios oficiales de traducción del tribunal." },
    nav: {
      home: "Inicio", how: "Cómo funciona", eligibility: "Elegibilidad", recordDetails: "Detalles del antecedente", packetGeneration: "Generación del paquete", recordWatch: "RecordWatch", courtAccess: "Acceso para tribunales", packet: "Paquete", dashboard: "Panel", account: "Cuenta", login: "Iniciar sesión", logout: "Cerrar sesión", createAccount: "Crear cuenta", checkEligibility: "Comenzar revisión gratuita de elegibilidad"
    },
    footer: {
      copy: "Flujo guiado de alivio de antecedentes y preparación de paquetes judiciales.",
      legal: "RecordPathAI no es un bufete de abogados y no brinda asesoría legal. Los documentos se generan según la información del usuario y formularios disponibles públicamente.",
      terms: "Términos", privacy: "Privacidad", disclaimer: "Aviso legal"
    },
    buttons: {
      continue: "Continuar", back: "Atrás", finish: "Finalizar", save: "Guardar", delete: "Eliminar", remove: "Quitar", resume: "Continuar", cancel: "Cancelar", submit: "Enviar", start: "Comenzar", import: "Importar", notNow: "Ahora no", clearPad: "Borrar firma", useDrawnSignature: "Usar firma dibujada", generatePacket: "Generar paquete", payGeneratePacket: "Pagar $50 y generar paquete", activateRecordWatch: "Activar RecordWatch", startMonthly: "Comenzar mensual", saveAnnual: "Ahorrar con anual", cancelSubscription: "Cancelar suscripción", openPacket: "Abrir paquete", openRecordWatch: "Abrir RecordWatch", editRecordDetails: "Editar detalles del antecedente", saveAccount: "Guardar cuenta", saveNotificationPreferences: "Guardar preferencias de notificación"
    },
    forms: {
      fullName: "Nombre completo", firstName: "Nombre", lastName: "Apellido", address: "Dirección", address1: "Dirección línea 1", address2: "Dirección línea 2", city: "Ciudad", zip: "Código postal", password: "Contraseña", emailPlaceholder: "usted@ejemplo.com", optional: "Opcional", selectState: "Seleccione estado", phonePlaceholder: "Número de teléfono"
    },
    auth: {
      loginTitle: "Iniciar sesión", signupTitle: "Crear cuenta", importTitle: "¿Importar datos de demostración?", importPrompt: "Encontramos datos anteriores de RecordPathAI guardados solo en este navegador. ¿Desea importarlos a esta cuenta de Supabase?", importing: "Importando…", importedCases: "Se importaron {count} caso(s).", signInRequired: "Inicie sesión para continuar.", signInBeforeAccount: "Inicie sesión antes de actualizar los datos de la cuenta.", accountNotFound: "No se encontró la cuenta actual de Supabase."
    },
    home: {
      heroTitle: "Alivio de antecedentes judiciales, automatizado.", heroCta: "Ver cómo funciona", eyebrow: "Automatización de documentos judiciales", heroCopy: "Revise su elegibilidad gratis, ingrese los detalles de su caso, genere un paquete listo para el tribunal cuando sea elegible y complete un pago seguro en línea.", trust: "Revisiones de elegibilidad gratis. El pago seguro en línea ya está activo.", workflow: "Flujo de RecordPathAI", problemTitle: "El problema", solutionTitle: "La solución"
    },
    howItWorks: { title: "Cómo funciona" },
    eligibility: {
      title: "Formulario de elegibilidad", pageSubtitle: "Ingrese su información personal y postal. RecordPathAI usará esta información en los detalles del antecedente y en el flujo de generación del paquete.", notice: "Importante: esta página recopila solo su información personal y postal. Los detalles del caso, los cargos, el tribunal y los resultados de elegibilidad se manejan en los siguientes pasos.", screeningResult: "Resultado de evaluación para {state}", eligibleNow: "Elegible ahora", eligibleOn: "Elegible el {date}", notScreened: "Aún no evaluado", moreInfoNeeded: "Se necesita más información"
    },
    recordDetails: {
      title: "Detalles del antecedente", pageTitle: "Ingrese los detalles de su antecedente", chargeName: "Nombre del cargo", dispositionOutcome: "Resolución / Resultado", chargeLevel: "Nivel del cargo", offenseNumber: "Delito {number}", oneOffenseAdded: "1 delito agregado", offensesAdded: "{count} delitos agregados", searchPrompt: "Ingrese un tribunal y un estado para buscar el paquete oficial.", searchingForms: "Buscando formularios oficiales del tribunal...", foundPacket: "Paquete encontrado: {title}", noPacket: "Aún no se encontró un paquete oficial.", packetSearchError: "No pudimos buscar un paquete en este momento.", courtPlaceholder: "Ejemplo: Wood County Court of Common Pleas", countyPlaceholder: "Ejemplo: Condado de Wood", chargePlaceholder: "Empiece a escribir un cargo", dispositionPlaceholder: "Empiece a escribir una resolución", levelPlaceholder: "Empiece a escribir un nivel", notesPlaceholder: "Cualquier otro dato sobre este delito..."
    },
    record: {
      offense: "Delito",
      caseNumber: "Número de caso"
    },
    packet: {
      title: "Su paquete de presentación", generateTitle: "Generar paquete", eligibilityStatus: "Estado de elegibilidad", reliefType: "Tipo de alivio", ohioRecordSealing: "Sellado de antecedentes de Ohio", waitingPeriod: "Período de espera requerido", estimatedEligibleDate: "Fecha estimada de elegibilidad", recordWatchTracking: "Seguimiento en segundo plano de RecordWatch", pdfMapperLoaded: "Mapeador PDF cargado", template: "Plantilla", mappingJson: "JSON de mapeo", sourcePdf: "PDF de origen", mappedFields: "Campos mapeados", eligibleCheckout: "Elegible ahora — continúe al pago seguro...", stateMismatch: "Su estado de residencia y el estado del caso son diferentes. Use el estado del caso para las reglas del paquete judicial.", drawSignature: "Dibuje su firma abajo", drawnSignatureSelected: "Firma dibujada seleccionada.", signatureRequired: "Dibuje su firma antes de generar el paquete.", addCaseOrCharge: "Agregue al menos un cargo o número de caso.", saveBeforeCheckoutFailed: "No pudimos guardar su caso antes del pago.", openingCheckout: "Abriendo pago seguro...", checkoutError: "No pudimos iniciar el pago. Inténtelo de nuevo.", generationError: "No pudimos generar su paquete. Revise los campos obligatorios e inténtelo de nuevo.", offense: "Delito", caseNumber: "Número de caso", statute: "Estatuto", degree: "Grado", outcome: "Resultado", dispositionDate: "Fecha de resolución", dischargeDate: "Fecha de finalización", court: "Tribunal", county: "Condado", currentRecord: "Registro actual del paquete", savedRecord: "Registro guardado", notGenerated: "Paquete: no generado"
    },
    dashboard: {
      welcome: "Bienvenido", nextAction: "Siguiente acción", reviewPacketPayment: "Revisar paquete y pago", savedCases: "Casos guardados", purchaseLedger: "Registro de compras", totalPurchases: "Compras totales", creditsRefunds: "Créditos / Reembolsos", currentBalance: "Saldo actual", lastTransaction: "Última transacción", noTransactions: "Aún no hay transacciones", ledgerEmpty: "Sus compras y créditos aparecerán aquí cuando haya actividad disponible."
    },
    recordWatch: {
      title: "RecordWatch", neverMiss: "No pierda su fecha de elegibilidad", freeReminders: "Recordatorios gratuitos de elegibilidad", premium: "RecordWatch Premium", smsAlerts: "Alertas por SMS", emailReminders: "Recordatorios por correo electrónico", filingReminders: "Recordatorios de presentación", courtStatusUpdates: "Actualizaciones del estado del tribunal", communicationPreferences: "Preferencias de comunicación", upcomingAlerts: "Próximas alertas", reminderHistory: "Historial de recordatorios", notificationStatus: "Estado de notificación", noReminders: "Aún no hay recordatorios", noAlerts: "No hay alertas programadas", notActivated: "RecordWatch: no activado", smsConsent: "Acepto recibir recordatorios de elegibilidad y alertas de RecordWatch por SMS.", stopOptOut: "Responda STOP para dejar de recibir mensajes SMS en cualquier momento.", signInSms: "Inicie sesión para administrar recordatorios SMS.", premiumRequiredSms: "Se requiere RecordWatch Premium antes de activar SMS.", enterPhoneSms: "Ingrese un número de teléfono antes de activar SMS.", checkConsentSms: "Marque la casilla de consentimiento SMS antes de activar SMS.", optedOutSms: "SMS está dado de baja. Responda START a su proveedor de SMS si está disponible y luego guarde el consentimiento de nuevo."
    },
    courtAccess: { title: "Acceso para tribunales", onlineFilings: "Presentaciones en línea", filingReview: "Revisión de presentaciones", approvals: "Aprobaciones", integrations: "Integraciones", dashboard: "Panel del tribunal" },
    clerk: { title: "Cuenta del secretario" },
    ledger: { empty: "Sus compras y créditos aparecerán aquí cuando haya actividad disponible." },
    savedCases: { deleteConfirm: "¿Eliminar este caso guardado? Esta acción no se puede deshacer.", notFound: "No pudimos encontrar ese caso guardado. Elija otro caso desde su panel.", updateFailed: "No pudimos actualizar ese caso guardado.", caseNotRemoved: "No se eliminó el caso.", noSavedCases: "Aún no hay casos guardados." },
    account: { settings: "Configuración de la cuenta", subtitle: "Actualice su perfil de cuenta de Supabase.", metadata: "Metadatos de la cuenta", userId: "ID de usuario", lastLogin: "Último inicio de sesión", notificationPreferences: "Preferencias de notificación", notificationCopy: "Elija cómo RecordPathAI puede comunicarse con usted sobre recordatorios de elegibilidad, recordatorios de paquetes y novedades del producto." },
    terms: { title: "Términos de uso" },
    privacy: { title: "Política de privacidad" },
    disclaimer: { title: "Aviso legal" },
    errors: { invalidJson: "JSON no válido.", searchFailed: "Falló la búsqueda", supabaseClientLoad: "No se pudo cargar la biblioteca de cliente de Supabase.", supabaseClientInit: "La biblioteca de cliente de Supabase no se inicializó.", courtFormMissing: "No se encontró la configuración del formulario judicial.", noSavedResult: "No se encontró un resultado guardado. Ejecute primero la calculadora." },
    status: { completed: "Completado", current: "Actual", locked: "Bloqueado", available: "Disponible", notStarted: "No iniciado", inProgress: "En curso", waiting: "En espera", verifiedCorrected: "Corrección verificada", followUpNeeded: "Requiere seguimiento", eligible: "Elegible" },
    workflow: { consumerWorkflow: "Flujo del consumidor", stepsCompleted: "{completed} de {total} pasos completados", completePrevious: "Complete primero el paso anterior del flujo.", packetGeneration: "generación del paquete", completeEligibilityBefore: "Complete la revisión de elegibilidad antes de {action}.", completeRecordBefore: "Complete los detalles del antecedente antes de {action}." }
  };

  const translations = { en, es };

  const exactPhraseEs = {
    "RecordPathAI Mapper V3": "Mapeador RecordPathAI V3",
    "RecordPathAI Legal": "Legal de RecordPathAI",
    "Account": "Cuenta",
    "Account settings": "Configuración de la cuenta",
    "Update your Supabase account profile.": "Actualice su perfil de cuenta de Supabase.",
    "Full name": "Nombre completo",
    "Phone": "Teléfono",
    "Account metadata": "Metadatos de la cuenta",
    "User ID": "ID de usuario",
    "Last login": "Último inicio de sesión",
    "Save Account": "Guardar cuenta",
    "Logout": "Cerrar sesión",
    "Notification Preferences": "Preferencias de notificación",
    "Choose how RecordPathAI may contact you about eligibility reminders, packet reminders, and product updates.": "Elija cómo RecordPathAI puede comunicarse con usted sobre recordatorios de elegibilidad, recordatorios de paquetes y novedades del producto.",
    "Email me when I may become eligible": "Envíeme un correo cuando pueda ser elegible",
    "Text me when I may become eligible": "Envíeme un mensaje de texto cuando pueda ser elegible",
    "Send court status updates": "Enviar actualizaciones del estado del tribunal",
    "Remind me to finish my packet": "Recordarme que termine mi paquete",
    "Send product updates and announcements": "Enviar novedades y anuncios del producto",
    "Save Notification Preferences": "Guardar preferencias de notificación",
    "Guided record relief workflow and court packet preparation.": "Flujo guiado de alivio de antecedentes y preparación de paquetes judiciales.",
    "Authentication is powered by Supabase Auth.": "La autenticación funciona con Supabase Auth.",
    "Terms": "Términos",
    "Privacy": "Privacidad",
    "Disclaimer": "Aviso legal",
    "Court record relief, automated.": "Alivio de antecedentes judiciales, automatizado.",
    "See How It Works": "Ver cómo funciona",
    "How It Works": "Cómo funciona",
    "Eligibility": "Elegibilidad",
    "Record Details": "Detalles del antecedente",
    "Packet Generation": "Generación del paquete",
    "Court Access": "Acceso para tribunales",
    "Start Free Eligibility Check": "Comenzar revisión gratuita de elegibilidad",
    "Generate Packet": "Generar paquete",
    "Eligibility Status": "Estado de elegibilidad",
    "Screening result for OH": "Resultado de evaluación para OH",
    "Relief Type": "Tipo de alivio",
    "Ohio Record Sealing": "Sellado de antecedentes de Ohio",
    "Required Waiting Period": "Período de espera requerido",
    "Estimated Eligible Date": "Fecha estimada de elegibilidad",
    "RecordWatch background tracking": "Seguimiento en segundo plano de RecordWatch",
    "PDF mapper loaded": "Mapeador PDF cargado",
    "Template": "Plantilla",
    "Mapping JSON": "JSON de mapeo",
    "Source PDF": "PDF de origen",
    "Mapped fields": "Campos mapeados",
    "Eligible now — continue to secure checkout...": "Elegible ahora — continúe al pago seguro...",
    "Draw your signature below": "Dibuje su firma abajo",
    "Use Drawn Signature": "Usar firma dibujada",
    "Clear Pad": "Borrar firma",
    "Pay $50 & Generate Packet": "Pagar $50 y generar paquete",
    "Finish": "Finalizar",
    "Back": "Atrás",
    "Welcome": "Bienvenido",
    "Next Action": "Siguiente acción",
    "Review packet and payment": "Revisar paquete y pago",
    "Continue": "Continuar",
    "Edit Record Details": "Editar detalles del antecedente",
    "Open RecordWatch": "Abrir RecordWatch",
    "Saved Cases": "Casos guardados",
    "Resume": "Continuar",
    "Open Packet": "Abrir paquete",
    "Delete": "Eliminar",
    "Purchase Ledger": "Registro de compras",
    "Total Purchases": "Compras totales",
    "Credits / Refunds": "Créditos / Reembolsos",
    "Current Balance": "Saldo actual",
    "Last Transaction": "Última transacción",
    "No transactions yet": "Aún no hay transacciones",
    "Your purchases and credits will appear here...": "Sus compras y créditos aparecerán aquí...",
    "Never Miss Your Eligibility Date": "No pierda su fecha de elegibilidad",
    "Free Eligibility Reminders": "Recordatorios gratuitos de elegibilidad",
    "Premium RecordWatch": "RecordWatch Premium",
    "SMS alerts": "Alertas por SMS",
    "Email reminders": "Recordatorios por correo electrónico",
    "Filing reminders": "Recordatorios de presentación",
    "Court status updates": "Actualizaciones del estado del tribunal",
    "Communication Preferences": "Preferencias de comunicación",
    "Upcoming Alerts": "Próximas alertas",
    "Reminder History": "Historial de recordatorios",
    "Notification Status": "Estado de notificación",
    "Active": "Activo",
    "No reminders yet": "Aún no hay recordatorios",
    "No alerts scheduled": "No hay alertas programadas",
    "Activate RecordWatch": "Activar RecordWatch",
    "Start Monthly": "Comenzar mensual",
    "Save with Annual": "Ahorrar con anual",
    "Cancel Subscription": "Cancelar suscripción",
    "Online filings": "Presentaciones en línea",
    "Filing review": "Revisión de presentaciones",
    "Approvals": "Aprobaciones",
    "Integrations": "Integraciones",
    "Court dashboard": "Panel del tribunal",
    "Clerk Account": "Cuenta del secretario",
    "Case Number": "Número de caso",
    "Court": "Tribunal",
    "County": "Condado",
    "State": "Estado",
    "Charge": "Cargo",
    "Offense": "Delito",
    "Statute": "Estatuto",
    "Degree": "Grado",
    "Outcome": "Resultado",
    "Disposition Date": "Fecha de resolución",
    "Discharge Date": "Fecha de finalización",
    "Sentence Completion Date": "Fecha de cumplimiento de sentencia",
    "Probation Completion Date": "Fecha de finalización de la libertad condicional",
    "Arrest Date": "Fecha de arresto",
    "Offense Date": "Fecha del delito",
    "Judge": "Juez",
    "Prosecutor": "Fiscal",
    "Defense Attorney": "Abogado defensor",
    "Booking Number": "Número de registro de arresto",
    "Arresting Agency": "Agencia que realizó el arresto",
    "Detention Facility": "Centro de detención",
    "Case Number:": "Número de caso:",
    "Eligible now": "Elegible ahora",
    "Not screened yet": "Aún no evaluado",
    "Packet: Not generated": "Paquete: no generado",
    "RecordWatch: Not Activated": "RecordWatch: no activado",
    "Drawn signature selected.": "Firma dibujada seleccionada.",
    "Please draw your signature before generating your packet.": "Dibuje su firma antes de generar el paquete.",
    "Add at least one charge or case number.": "Agregue al menos un cargo o número de caso.",
    "We could not save your case before checkout.": "No pudimos guardar su caso antes del pago.",
    "Invalid JSON.": "JSON no válido.",
    "Not available": "No disponible",
    "No saved cases yet.": "Aún no hay casos guardados.",
    "Delete this saved case? This cannot be undone.": "¿Eliminar este caso guardado? Esta acción no se puede deshacer.",
    "We could not find that saved case. Please choose another case from your dashboard.": "No pudimos encontrar ese caso guardado. Elija otro caso desde su panel.",
    "We could not update that saved case.": "No pudimos actualizar ese caso guardado.",
    "Case was not removed.": "No se eliminó el caso.",
    "Sign in to manage SMS reminders.": "Inicie sesión para administrar recordatorios SMS.",
    "Premium RecordWatch is required before SMS can be enabled.": "Se requiere RecordWatch Premium antes de activar SMS.",
    "Enter a phone number before enabling SMS.": "Ingrese un número de teléfono antes de activar SMS.",
    "Check the SMS consent box before enabling SMS.": "Marque la casilla de consentimiento SMS antes de activar SMS.",
    "SMS is opted out. Reply START to your SMS provider if supported, then save consent again.": "SMS está dado de baja. Responda START a su proveedor de SMS si está disponible y luego guarde el consentimiento de nuevo.",
    "You May Now Be Eligible": "Es posible que ahora sea elegible",
    "Finish Your RecordPathAI Packet": "Termine su paquete de RecordPathAI",
    "RecordPathAI Court Status Update": "Actualización de estado del tribunal de RecordPathAI",
    "RecordPathAI Eligibility Reminder": "Recordatorio de elegibilidad de RecordPathAI",
    "Based on the information provided, your waiting period appears complete. Log in to RecordPathAI to verify eligibility and generate your packet.": "Según la información proporcionada, su período de espera parece completo. Inicie sesión en RecordPathAI para verificar la elegibilidad y generar su paquete.",
    "Your eligibility review is complete. Finish your record details to generate your court packet.": "Su revisión de elegibilidad está completa. Termine los detalles del antecedente para generar su paquete judicial.",
    "Good news. Based on current information, your record may become eligible for sealing in approximately 180 days.": "Buenas noticias. Según la información actual, su antecedente puede ser elegible para sellado en aproximadamente 180 días.",
    "Good news. Based on current information, your record may become eligible for sealing in approximately 90 days.": "Buenas noticias. Según la información actual, su antecedente puede ser elegible para sellado en aproximadamente 90 días.",
    "Good news. Based on current information, your record may become eligible for sealing in approximately 30 days.": "Buenas noticias. Según la información actual, su antecedente puede ser elegible para sellado en aproximadamente 30 días.",
    "Good news. Based on current information, your record may become eligible for sealing in approximately 7 days.": "Buenas noticias. Según la información actual, su antecedente puede ser elegible para sellado en aproximadamente 7 días.",
    "RecordWatch has an update about your eligibility timeline.": "RecordWatch tiene una actualización sobre su cronograma de elegibilidad."
  };

  const wordAndPhraseRules = [
    [/\bCourt record relief\b/gi, "Alivio de antecedentes judiciales"], [/\brecord relief\b/gi, "alivio de antecedentes"], [/\bcriminal record\b/gi, "antecedente penal"], [/\brecord details\b/gi, "detalles del antecedente"], [/\bsaved cases\b/gi, "casos guardados"], [/\bsaved case\b/gi, "caso guardado"], [/\bcase number\b/gi, "número de caso"], [/\bcourt\b/gi, "tribunal"], [/\bcounty\b/gi, "condado"], [/\bstate\b/gi, "estado"], [/\bcharge\b/gi, "cargo"], [/\boffense\b/gi, "delito"], [/\boutcome\b/gi, "resultado"], [/\bdisposition date\b/gi, "fecha de resolución"], [/\bdischarge date\b/gi, "fecha de finalización"], [/\beligibility\b/gi, "elegibilidad"], [/\beligible\b/gi, "elegible"], [/\bpacket\b/gi, "paquete"], [/\bgenerate\b/gi, "generar"], [/\bfiling\b/gi, "presentación"], [/\bonline\b/gi, "en línea"], [/\bpayment\b/gi, "pago"], [/\bsecure\b/gi, "seguro"], [/\breminder(s)?\b/gi, "recordatorios"], [/\bnotification(s)?\b/gi, "notificaciones"], [/\bpreference(s)?\b/gi, "preferencias"], [/\baccount\b/gi, "cuenta"], [/\bdashboard\b/gi, "panel"], [/\bstatus\b/gi, "estado"], [/\bdetails\b/gi, "detalles"], [/\binformation\b/gi, "información"], [/\baddress\b/gi, "dirección"], [/\bname\b/gi, "nombre"], [/\bfirst\b/gi, "primer"], [/\blast\b/gi, "último"], [/\bemail\b/gi, "correo electrónico"], [/\bphone\b/gi, "teléfono"], [/\bcontinue\b/gi, "continuar"], [/\bfinish\b/gi, "finalizar"], [/\bback\b/gi, "atrás"], [/\bsave\b/gi, "guardar"], [/\bdelete\b/gi, "eliminar"], [/\bremove\b/gi, "quitar"], [/\bstart\b/gi, "comenzar"], [/\bfree\b/gi, "gratis"], [/\bpremium\b/gi, "premium"], [/\bmonthly\b/gi, "mensual"], [/\bannual\b/gi, "anual"], [/\bcancel\b/gi, "cancelar"], [/\bsubscription\b/gi, "suscripción"], [/\bprivacy\b/gi, "privacidad"], [/\bterms\b/gi, "términos"], [/\bdisclaimer\b/gi, "aviso legal"], [/\bnot legal advice\b/gi, "no es asesoría legal"], [/\blaw firm\b/gi, "bufete de abogados"], [/\bclerk\b/gi, "secretario"], [/\bapproval(s)?\b/gi, "aprobaciones"], [/\bintegration(s)?\b/gi, "integraciones"], [/\breview\b/gi, "revisión"], [/\bloading\b/gi, "cargando"], [/\bno transactions yet\b/gi, "aún no hay transacciones"], [/\bnot generated\b/gi, "no generado"], [/\bnot activated\b/gi, "no activado"]
  ];

  function flatten(prefix, source, target) {
    Object.keys(source).forEach(function (key) {
      const value = source[key];
      const next = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) flatten(next, value, target);
      else target[next] = value;
    });
    return target;
  }

  const flat = { en: flatten("", en, {}), es: flatten("", es, {}) };

  function interpolate(value, params) {
    if (!params || typeof value !== "string") return value;
    return value.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
    });
  }

  function getLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(function (key) { return localStorage.getItem(key); }).find(Boolean);
    return supportedLanguages.indexOf(stored) !== -1 ? stored : DEFAULT_LANG;
  }

  function warnMissing(key, lang) {
    const id = `${lang}:${key}`;
    if (missingKeys.has(id)) return;
    missingKeys.add(id);
    console.warn(`[i18n] Missing translation key "${key}" for "${lang}"; falling back to English.`);
  }

  function translateKey(key, params, lang) {
    const selected = lang || getLanguage();
    const localized = flat[selected] && flat[selected][key];
    const fallback = flat.en[key];
    if (localized == null) {
      if (fallback == null) {
        warnMissing(key, selected);
        return interpolate(key, params);
      }
      if (selected !== DEFAULT_LANG) warnMissing(key, selected);
      return interpolate(fallback, params);
    }
    return interpolate(localized, params);
  }

  function shouldPreserveText(text) {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^(RecordPathAI|RecordWatch|Stripe|Supabase)$/i.test(trimmed)) return true;
    if (/^(https?:|mailto:|\.\.?\/|\/api\/|[\w.-]+@[\w.-]+\.[a-z]{2,})/i.test(trimmed)) return true;
    if (/^\d+(?:\.\d+)*(?:\([A-Za-z0-9]+\))?$/.test(trimmed)) return true;
    if (/^[A-Z]{2,}$/.test(trimmed) && trimmed.length <= 5) return true;
    return false;
  }

  function heuristicSpanish(phrase) {
    if (shouldPreserveText(phrase)) return phrase;
    let result = phrase;
    wordAndPhraseRules.forEach(function (rule) { result = result.replace(rule[0], rule[1]); });
    return result === phrase ? phrase : result;
  }

  function translatePhrase(phrase, params, lang) {
    const selected = lang || getLanguage();
    if (selected === DEFAULT_LANG || shouldPreserveText(phrase)) return interpolate(phrase, params);
    if (exactPhraseEs[phrase] != null) return interpolate(exactPhraseEs[phrase], params);
    return interpolate(heuristicSpanish(phrase), params);
  }

  function t(key, params) {
    if (flat.en[key] != null || (flat[getLanguage()] && flat[getLanguage()][key] != null)) return translateKey(key, params);
    if (/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(key)) {
      warnMissing(key, getLanguage());
      return interpolate(key, params);
    }
    return translatePhrase(key, params);
  }

  function hasKey(key, lang) {
    return Boolean(key && ((flat[lang] && flat[lang][key] != null) || flat.en[key] != null));
  }

  function translateKeyOrOriginal(key, original, lang) {
    if (hasKey(key, lang)) return translateKey(key, null, lang);
    if (key) warnMissing(key, lang);
    return translatePhrase(original || "", null, lang);
  }

  function setTranslatedAttribute(node, attr, key, lang) {
    if (!key) return;
    const originalAttr = `__recordPathOriginal_${attr}`;
    const original = node[originalAttr] || node.getAttribute(attr) || "";
    node[originalAttr] = original;
    node.setAttribute(attr, translateKeyOrOriginal(key, original, lang));
  }

  function translateNodeByAttributes(node, lang) {
    const key = node.getAttribute("data-i18n");
    const legacyAttr = node.getAttribute("data-i18n-attr");
    if (key) {
      if (legacyAttr) {
        const originalAttr = `__recordPathOriginal_${legacyAttr}`;
        const original = node[originalAttr] || node.getAttribute(legacyAttr) || "";
        node[originalAttr] = original;
        node.setAttribute(legacyAttr, translateKeyOrOriginal(key, original, lang));
      } else {
        const original = node.__recordPathOriginalI18nText || node.textContent;
        node.__recordPathOriginalI18nText = original;
        node.textContent = translateKeyOrOriginal(key, original.trim(), lang);
      }
    }
    if (node.hasAttribute("data-i18n-html")) {
      const htmlKey = node.getAttribute("data-i18n-html");
      const original = node.__recordPathOriginalI18nHtml || node.innerHTML;
      node.__recordPathOriginalI18nHtml = original;
      node.innerHTML = hasKey(htmlKey, lang) ? translateKey(htmlKey, null, lang) : original;
    }
    setTranslatedAttribute(node, "placeholder", node.getAttribute("data-i18n-placeholder"), lang);
    setTranslatedAttribute(node, "title", node.getAttribute("data-i18n-title"), lang);
    setTranslatedAttribute(node, "aria-label", node.getAttribute("data-i18n-aria-label"), lang);
    if (node.hasAttribute("data-i18n-value")) {
      const original = node.__recordPathOriginal_value || node.value || "";
      node.__recordPathOriginal_value = original;
      node.value = translateKeyOrOriginal(node.getAttribute("data-i18n-value"), original, lang);
    }
  }

  function translateTextNode(textNode, lang) {
    const original = textNode.__recordPathOriginalText || textNode.nodeValue;
    const trimmed = original.trim();
    if (!trimmed) return;
    textNode.__recordPathOriginalText = original;
    const before = original.match(/^\s*/)[0];
    const after = original.match(/\s*$/)[0];
    textNode.nodeValue = before + translatePhrase(trimmed, null, lang) + after;
  }

  function translateVisibleText(root, lang) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-i18n],[data-i18n-html]")) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) { translateTextNode(node, lang); });
  }

  function translateCommonAttributes(root, lang) {
    root.querySelectorAll("[placeholder]:not([data-i18n-placeholder]), [title]:not([data-i18n-title]), [aria-label]:not([data-i18n-aria-label]), input[type='button'][value]:not([data-i18n-value]), input[type='submit'][value]:not([data-i18n-value])").forEach(function (node) {
      ["placeholder", "title", "aria-label", "value"].forEach(function (attr) {
        if (!node.hasAttribute(attr)) return;
        const originalAttr = `__recordPathOriginal_${attr}`;
        const original = node[originalAttr] || node.getAttribute(attr);
        node[originalAttr] = original;
        node.setAttribute(attr, translatePhrase(original, null, lang));
      });
    });
  }

  function ensureLanguageSelector() {
    if (document.querySelector("[data-language-selector]")) return;
    if (!document.body) return;
    const wrapper = document.createElement("div");
    wrapper.className = "language-access language-access-floating";
    wrapper.style.cssText = "position:fixed;right:1rem;bottom:1rem;z-index:9999;background:#fff;border:1px solid #d8dee9;border-radius:999px;padding:.45rem .7rem;box-shadow:0 8px 24px rgba(15,23,42,.12);font:14px system-ui,sans-serif;";
    wrapper.innerHTML = '<label for="recordpathai-floating-language" data-i18n="lang.label" style="margin-right:.35rem;">Language Access</label><select id="recordpathai-floating-language" data-language-selector><option value="en" data-i18n="lang.english">English</option><option value="es" data-i18n="lang.spanish">Español</option></select>';
    document.body.appendChild(wrapper);
  }

  let applying = false;
  let observer = null;

  function applyLanguage(lang) {
    const selected = supportedLanguages.indexOf(lang) !== -1 ? lang : getLanguage();
    if (applying) return;
    applying = true;
    if (observer) observer.disconnect();
    document.documentElement.lang = selected;
    ensureLanguageSelector();
    document.querySelectorAll("[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-value]").forEach(function (node) { translateNodeByAttributes(node, selected); });
    translateCommonAttributes(document, selected);
    translateVisibleText(document.body || document.documentElement, selected);
    document.querySelectorAll("[data-language-selector]").forEach(function (selector) { selector.value = selected; });
    if (observer) observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "value"] });
    applying = false;
  }

  function setLanguage(lang) {
    const next = supportedLanguages.indexOf(lang) !== -1 ? lang : DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, next);
    sessionStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
    window.dispatchEvent(new CustomEvent("recordpathai:languagechange", { detail: { language: next } }));
  }

  function translateAddedNode(node) {
    if (applying || !node) return;
    applyLanguage(getLanguage());
  }

  function patchDialogs() {
    if (window.__recordPathDialogsPatched) return;
    window.__recordPathDialogsPatched = true;
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    window.alert = function (message) { return originalAlert.call(window, typeof message === "string" ? t(message) : message); };
    window.confirm = function (message) { return originalConfirm.call(window, typeof message === "string" ? t(message) : message); };
  }

  function boot() {
    ensureLanguageSelector();
    document.querySelectorAll("[data-language-selector]").forEach(function (selector) {
      if (selector.dataset.i18nAttached === "true") return;
      selector.dataset.i18nAttached = "true";
      selector.addEventListener("change", function (event) { setLanguage(event.target.value); });
    });
    patchDialogs();
    observer = new MutationObserver(function (mutations) {
      if (applying) return;
      if (mutations.some(function (mutation) { return mutation.type === "childList" || mutation.type === "characterData" || mutation.type === "attributes"; })) translateAddedNode(document.body);
    });
    applyLanguage(getLanguage());
  }

  window.RecordPathI18n = { t, translate: t, getLanguage, setLanguage, applyLanguage, dictionary: translations, phraseTranslations: exactPhraseEs };
  window.t = t;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}());
