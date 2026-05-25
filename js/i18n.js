(function () {
  const STORAGE_KEY = 'recordpathai_language';
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
      'nav.checkEligibility': 'Check Eligibility',

      'index.hero.title': 'Court record relief, automated.',
      'index.hero.seeHow': 'See How It Works',
      'how.title': 'How It Works',
      'eligibility.title': 'Eligibility Intake',
      'record.title': 'Record Details',
      'packet.title': 'Your Filing Packet',

      'index.eyebrow': 'Court document automation',
      'index.hero.copy': 'Millions of Americans may qualify to seal or expunge a record. RecordPathAI guides users through eligibility intake, case details, and court-ready packet generation.',
      'index.trust': 'Secure online payment is now available.',
      'index.workflow': 'RecordPathAI Workflow',
      'index.packetBuilder': 'Court Packet Builder',
      'index.status.ready': 'Ready',
      'index.progress.pdf': 'PDF Packet',
      'index.caseState': 'Case State',
      'index.county': 'County',
      'index.selectedCourtForm': 'Selected Court Form',
      'index.pdfGenerated': 'PDF Generated',
      'index.mappedFields': '33 mapped fields filled',
      'index.problem.title': 'The Problem',
      'index.problem.copy': 'Record relief is confusing, fragmented, and court-specific.',
      'index.solution.title': 'The Solution',
      'index.solution.copy': 'RecordPathAI converts user intake into structured data and generates court-specific filing packets.',
      'index.how.1.title': '1. Eligibility Intake',
      'index.how.1.copy': 'Users can check eligibility, enter case details, generate a court-ready packet, and complete payment online.',
      'index.how.2.title': '2. Record Details',
      'index.how.2.copy': 'Capture charges, statutes, outcomes, courts, dates, and case state.',
      'index.how.3.title': '3. Packet Generation',
      'index.how.3.copy': 'Generate a court-ready packet and complete secure online payment.',
      'index.built.title': 'Built for consumer access. Designed for court-tech integration.',
      'index.consumer.title': 'Consumer Front Door',
      'index.consumer.copy': 'Helps users start before they reach court systems.',
      'index.structured.title': 'Structured Legal Data',
      'index.structured.copy': 'Turns messy record information into standardized packet data.',
      'index.future.title': 'Future B2B Potential',
      'index.future.copy': 'Can integrate upstream with courts, legal aid, and case management platforms.',
      'index.capability.title': 'Current Capability',
      'index.now.title': 'What RecordPathAI does now',
      'index.now.1': 'Collects user intake',
      'index.now.2': 'Captures case and offense details',
      'index.now.3': 'Determines packet direction by case state',
      'index.now.4': 'Generates printable mapped PDF packets',
      'index.next.title': 'Roadmap',
      'index.next.1': 'Expanded court coverage',
      'index.next.2': 'Court e-filing integrations',
      'index.next.3': 'Automated form retrieval',
      'index.next.4': 'Case-management platform integrations',
      'index.cta.title': 'Start with your eligibility intake.',
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
      'nav.checkEligibility': 'Verificar elegibilidad',

      'index.hero.title': 'Alivio de antecedentes judiciales, automatizado.',
      'index.hero.seeHow': 'Ver cómo funciona',
      'how.title': 'Cómo funciona',
      'eligibility.title': 'Formulario de elegibilidad',
      'record.title': 'Detalles del registro',
      'packet.title': 'Su paquete de presentación',

      'index.eyebrow': 'Automatización de documentos judiciales',
      'index.hero.copy': 'Millones de personas en Estados Unidos pueden calificar para sellar o eliminar un antecedente. RecordPathAI guía a los usuarios por la elegibilidad, los detalles del caso y la generación de paquetes listos para la corte.',
      'index.trust': 'El pago seguro en línea ya está disponible.',
      'index.workflow': 'Flujo de RecordPathAI',
      'index.packetBuilder': 'Constructor de Paquete Judicial',
      'index.status.ready': 'Listo',
      'index.progress.pdf': 'Paquete PDF',
      'index.caseState': 'Estado del caso',
      'index.county': 'Condado',
      'index.selectedCourtForm': 'Formulario judicial seleccionado',
      'index.pdfGenerated': 'PDF generado',
      'index.mappedFields': '33 campos mapeados completados',
      'index.problem.title': 'El problema',
      'index.problem.copy': 'El alivio de antecedentes es confuso, fragmentado y específico de cada tribunal.',
      'index.solution.title': 'La solución',
      'index.solution.copy': 'RecordPathAI convierte la información del usuario en datos estructurados y genera paquetes de presentación específicos del tribunal.',
      'index.how.1.title': '1. Formulario de elegibilidad',
      'index.how.1.copy': 'Los usuarios pueden verificar elegibilidad, ingresar detalles del caso, generar un paquete listo para la corte y completar el pago en línea.',
      'index.how.2.title': '2. Detalles del registro',
      'index.how.2.copy': 'Captura cargos, estatutos, resultados, tribunales, fechas y estado del caso.',
      'index.how.3.title': '3. Generación de paquete',
      'index.how.3.copy': 'Genera un paquete listo para la corte y completa el pago seguro en línea.',
      'index.built.title': 'Creado para el acceso del consumidor. Diseñado para integración con tecnología judicial.',
      'index.consumer.title': 'Puerta de entrada para consumidores',
      'index.consumer.copy': 'Ayuda a los usuarios a comenzar antes de llegar a los sistemas judiciales.',
      'index.structured.title': 'Datos legales estructurados',
      'index.structured.copy': 'Convierte información desordenada del expediente en datos estandarizados para el paquete.',
      'index.future.title': 'Potencial B2B futuro',
      'index.future.copy': 'Puede integrarse con tribunales, asistencia legal y plataformas de gestión de casos.',
      'index.capability.title': 'Capacidad actual',
      'index.now.title': 'Lo que RecordPathAI hace ahora',
      'index.now.1': 'Recopila información inicial del usuario',
      'index.now.2': 'Captura detalles del caso y del delito',
      'index.now.3': 'Determina la ruta del paquete según el estado del caso',
      'index.now.4': 'Genera paquetes PDF mapeados e imprimibles',
      'index.next.title': 'Hoja de ruta',
      'index.next.1': 'Cobertura judicial ampliada',
      'index.next.2': 'Integraciones de presentación electrónica judicial',
      'index.next.3': 'Recuperación automatizada de formularios',
      'index.next.4': 'Integraciones con plataformas de gestión de casos',
      'index.cta.title': 'Comience con su formulario de elegibilidad.',
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
    }
  };

  function getLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return dictionary[stored] ? stored : DEFAULT_LANG;
  }

  function setLanguage(lang) {
    const next = dictionary[lang] ? lang : DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
  }

  function translateNode(node, lang) {
    const key = node.getAttribute('data-i18n');
    const attr = node.getAttribute('data-i18n-attr');
    const value = dictionary[lang] && dictionary[lang][key];
    if (!value) return;
    if (attr) node.setAttribute(attr, value);
    else node.textContent = value;
  }

  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((node) => translateNode(node, lang));
    const selector = document.querySelector('[data-language-selector]');
    if (selector) selector.value = lang;
  }

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
