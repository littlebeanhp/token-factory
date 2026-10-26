export const LANGS = ["en", "vi", "ms", "ru", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  vi: "Tiếng Việt",
  ms: "Bahasa Melayu",
  ru: "Русский",
  ja: "日本語",
};

type Strings = {
  platform: string;
  title: string;
  keyLabel: string;
  connect: string;
  checking: string;
  noKey: string;
  getKey: string;
  tick1: string;
  tick2: string;
  tick3: string;
  errEmpty: string;
  errInvalid: string;
  errNetwork: string;
  connected: string;
  model: string;
  openAgent: string;
  changeKey: string;
  downloading: string;
  language: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    platform: "Platform",
    title: "Enter FPT Token API key",
    keyLabel: "API key",
    connect: "Connect",
    checking: "Checking…",
    noKey: "Don't have a key?",
    getKey: "Get one from FPT Token Factory",
    tick1: "Ready Code / Cowork agent (wrapped with opencode)",
    tick2: "Uses FPT Token Factory by default",
    tick3: "Latest models (GLM-5.3, DeepSeek)",
    errEmpty: "Enter your API key",
    errInvalid: "That key was rejected. Check it and try again.",
    errNetwork: "Couldn't reach FPT Token Factory. Check your connection.",
    connected: "Connected",
    model: "Model",
    openAgent: "Open agent",
    changeKey: "Change key",
    downloading: "Preparing the agent (first run only)…",
    language: "Language",
  },
  vi: {
    platform: "Nền tảng",
    title: "Nhập FPT Token API key",
    keyLabel: "API key",
    connect: "Kết nối",
    checking: "Đang kiểm tra…",
    noKey: "Chưa có key?",
    getKey: "Lấy key tại FPT Token Factory",
    tick1: "Ready Code / Cowork agent (wrapped with opencode)",
    tick2: "Mặc định sử dụng với FPT Token Factory",
    tick3: "Các mô hình mới nhất (GLM-5.3, DeepSeek)",
    errEmpty: "Hãy nhập API key",
    errInvalid: "Key không hợp lệ. Kiểm tra lại rồi thử lại.",
    errNetwork: "Không kết nối được FPT Token Factory. Kiểm tra mạng của bạn.",
    connected: "Đã kết nối",
    model: "Mô hình",
    openAgent: "Mở agent",
    changeKey: "Đổi key",
    downloading: "Đang chuẩn bị agent (chỉ lần đầu)…",
    language: "Ngôn ngữ",
  },
  ms: {
    platform: "Platform",
    title: "Masukkan kunci API FPT Token",
    keyLabel: "Kunci API",
    connect: "Sambung",
    checking: "Menyemak…",
    noKey: "Tiada kunci?",
    getKey: "Dapatkan di FPT Token Factory",
    tick1: "Ejen Code / Cowork sedia digunakan (dibalut dengan opencode)",
    tick2: "Menggunakan FPT Token Factory secara lalai",
    tick3: "Model terkini (GLM-5.3, DeepSeek)",
    errEmpty: "Masukkan kunci API anda",
    errInvalid: "Kunci ditolak. Semak dan cuba lagi.",
    errNetwork: "Tidak dapat menghubungi FPT Token Factory. Semak sambungan anda.",
    connected: "Disambungkan",
    model: "Model",
    openAgent: "Buka ejen",
    changeKey: "Tukar kunci",
    downloading: "Menyediakan ejen (kali pertama sahaja)…",
    language: "Bahasa",
  },
  ru: {
    platform: "Платформа",
    title: "Введите API-ключ FPT Token",
    keyLabel: "API-ключ",
    connect: "Подключить",
    checking: "Проверка…",
    noKey: "Нет ключа?",
    getKey: "Получите его в FPT Token Factory",
    tick1: "Готовый агент Code / Cowork (на базе opencode)",
    tick2: "По умолчанию работает с FPT Token Factory",
    tick3: "Новейшие модели (GLM-5.3, DeepSeek)",
    errEmpty: "Введите API-ключ",
    errInvalid: "Ключ отклонён. Проверьте его и попробуйте снова.",
    errNetwork: "Не удалось подключиться к FPT Token Factory. Проверьте соединение.",
    connected: "Подключено",
    model: "Модель",
    openAgent: "Открыть агента",
    changeKey: "Сменить ключ",
    downloading: "Подготовка агента (только при первом запуске)…",
    language: "Язык",
  },
  ja: {
    platform: "プラットフォーム",
    title: "FPT Token API キーを入力",
    keyLabel: "API キー",
    connect: "接続",
    checking: "確認中…",
    noKey: "キーをお持ちでない場合",
    getKey: "FPT Token Factory で取得",
    tick1: "すぐ使える Code / Cowork エージェント（opencode ベース）",
    tick2: "FPT Token Factory を標準で使用",
    tick3: "最新モデル（GLM-5.3、DeepSeek）",
    errEmpty: "API キーを入力してください",
    errInvalid: "キーが拒否されました。確認して再試行してください。",
    errNetwork: "FPT Token Factory に接続できません。ネットワークを確認してください。",
    connected: "接続済み",
    model: "モデル",
    openAgent: "エージェントを開く",
    changeKey: "キーを変更",
    downloading: "エージェントを準備中（初回のみ）…",
    language: "言語",
  },
};

export function resolveLang(setting: string, vscodeLang: string): Lang {
  if ((LANGS as readonly string[]).includes(setting)) return setting as Lang;
  const base = vscodeLang.toLowerCase().split("-")[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : "en";
}
