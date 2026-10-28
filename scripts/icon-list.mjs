/**
 * Iconos de buscaDR (Font Awesome Free 7, CC BY 4.0 / MIT). Lista curada por grupos para la interfaz
 * y el selector del CMS Maestro (que además busca en la librería completa de Font Awesome Free).
 * `node scripts/build-icons.mjs` genera app/lib/icon-data.ts a partir de esta lista.
 * Nombres sin prefijo = estilo sólido; «regular:» = contorno; «brands:» = marcas.
 */
export const GROUPS = {
  "Salud y especialidades": [
    "stethoscope", "user-doctor", "user-nurse", "hospital", "hospital-user", "house-medical", "house-chimney-medical", "kit-medical",
    "briefcase-medical", "suitcase-medical", "staff-snake", "heart-pulse", "heart", "heart-circle-check", "baby", "baby-carriage",
    "child", "child-reaching", "children", "person-pregnant", "person-breastfeeding", "hands-holding-child", "hand-dots", "tooth", "brain",
    "head-side-virus", "head-side-cough", "head-side-mask", "apple-whole", "carrot", "lemon", "bowl-food", "person-walking",
    "person-running", "wheelchair", "wheelchair-move", "person-cane", "crutch", "bone", "eye", "eye-low-vision", "glasses", "ear-listen",
    "ear-deaf", "vial", "vials", "flask", "microscope", "dna", "virus", "virus-covid", "bacteria", "bacterium", "lungs", "lungs-virus",
    "comment-medical", "notes-medical", "file-medical", "file-prescription", "prescription", "prescription-bottle",
    "prescription-bottle-medical", "pills", "capsules", "tablets", "syringe", "thermometer", "temperature-half", "weight-scale",
    "bed-pulse", "truck-medical", "x-ray", "radiation", "hand-holding-medical", "hand-holding-heart", "hands-holding",
    "laptop-medical", "mask-face", "pump-medical", "droplet", "spa", "leaf", "seedling", "sun", "moon", "person", "person-dress",
    "venus", "mars", "venus-mars", "dumbbell", "spa", "hand-sparkles", "face-smile", "face-smile-beam", "face-meh", "face-frown",
  ],
  "Citas y agenda": [
    "calendar", "calendar-days", "calendar-check", "calendar-plus", "calendar-xmark", "calendar-week", "calendar-day", "clock",
    "hourglass-half", "stopwatch", "bell", "bell-slash", "video", "video-slash", "headset", "phone", "phone-volume", "mobile-screen",
    "laptop", "desktop", "clipboard", "clipboard-list", "clipboard-check", "clipboard-user", "list-check", "file-lines", "file-invoice",
    "file-invoice-dollar", "receipt", "qrcode", "id-card", "id-badge", "address-card", "building", "building-user", "city", "map-pin",
  ],
  "Personas y confianza": [
    "user", "users", "user-group", "user-check", "user-shield", "circle-user", "id-card", "handshake", "hand-holding-dollar", "thumbs-up",
    "award", "medal", "crown", "shield-halved", "lock", "key", "fingerprint",
  ],
  "Dinero y comercio": [
    "tag", "tags", "money-bill-wave", "wallet", "credit-card", "receipt", "piggy-bank", "percent", "coins", "store", "shop", "warehouse",
    "building", "cart-shopping", "chart-line", "chart-column", "sack-dollar",
  ],
  "Interfaz": [
    "magnifying-glass", "location-dot", "map", "map-location-dot", "location-crosshairs", "calendar", "calendar-days", "calendar-check",
    "clock", "hourglass-half", "stopwatch", "heart", "comment", "comments", "message", "bell", "gear", "sliders", "filter", "plus", "minus",
    "check", "circle-check", "xmark", "circle-xmark", "arrow-right", "arrow-left", "chevron-right", "chevron-left", "chevron-down",
    "share-nodes", "pen-to-square", "eye", "eye-slash", "pause", "play", "flag", "list", "table-cells-large", "circle-info",
    "triangle-exclamation", "circle-question", "right-from-bracket", "arrows-rotate", "image", "images", "upload", "download", "phone",
    "envelope", "link", "copy", "qrcode", "box-open", "fire", "bars", "ellipsis", "house-user", "grip", "font", "paper-plane", "comment-dots", "regular:comment-dots",
    "lock-open", "arrow-up-right-from-square", "circle-dot", "street-view", "house", "star", "star-half-stroke", "camera", "chevron-up",
    "circle-plus", "rotate", "print", "globe", "user-plus", "user-pen", "wand-magic-sparkles", "gift", "money-bill",
  ],
  "Contorno": [
    "regular:house", "regular:calendar", "regular:calendar-days", "regular:calendar-check", "regular:comment", "regular:comments",
    "regular:message", "regular:user", "regular:circle-user", "regular:heart", "regular:bell", "regular:star", "regular:map",
    "regular:clock", "regular:image", "regular:images", "regular:eye", "regular:bookmark", "regular:envelope", "regular:credit-card",
    "regular:lightbulb", "regular:handshake", "regular:thumbs-up", "regular:circle-check", "regular:square-plus", "regular:paper-plane",
    "regular:pen-to-square", "regular:trash-can", "regular:id-card", "regular:money-bill-1", "regular:truck", "regular:sun",
    "regular:snowflake", "regular:headphones", "regular:keyboard", "regular:hard-drive", "regular:camera", "regular:gem",
    "regular:compass", "regular:hourglass-half", "regular:flag", "regular:copy", "regular:file-lines", "regular:folder-open",
  ],
  "Marcas": ["brands:whatsapp", "brands:google", "brands:facebook", "brands:instagram", "brands:tiktok", "brands:youtube", "brands:x-twitter", "brands:linkedin"],
};
