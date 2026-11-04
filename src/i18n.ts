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
  useProxy: string;
  proxyLabel: string;
  errProxy: string;
  errProxyNet: string;
  viaProxy: string;
  language: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    platform: "Platform",
    title: "Enter FPT AI Factory API key",
    keyLabel: "API key",
    connect: "Connect",
    checking: "Checking…",
    noKey: "Don't have a key?",
    getKey: "Get one from FPT AI Factory",
    tick1: "Ready Code / Cowork agent (wrapped with opencode)",
    tick2: "Uses FPT AI Factory by default",
    tick3: "Latest models (GLM-5.3, DeepSeek)",
    errEmpty: "Enter your API key",
    errInvalid: "That key was rejected. Check it and try again.",
    errNetwork: "Couldn't reach FPT AI Factory. Check your connection.",
    connected: "Connected",
    model: "Model",
    openAgent: "Open agent",
    changeKey: "Change key",
    downloading: "Preparing the agent (first run only)…",
    useProxy: "Use a proxy",
    proxyLabel: "Proxy server (IP:port)",
    errProxy: "Enter a valid proxy address, e.g. 10.0.0.1:8080",
    errProxyNet: "Couldn't reach FPT AI Factory through the proxy. Check the proxy address.",
    viaProxy: "Via proxy",
    language: "Language",
  },
  vi: {
    platform: "Nền tảng",
    title: "Nhập FPT AI Factory API key",
    keyLabel: "API key",
    connect: "Kết nối",
    checking: "Đang kiểm tra…",
    noKey: "Chưa có key?",
    getKey: "Lấy key tại FPT AI Factory",
    tick1: "Ready Code / Cowork agent (wrapped with opencode)",
    tick2: "Mặc định sử dụng với FPT AI Factory",
    tick3: "Các mô hình mới nhất (GLM-5.3, DeepSeek)",
    errEmpty: "Hãy nhập API key",
    errInvalid: "Key không hợp lệ. Kiểm tra lại rồi thử lại.",
    errNetwork: "Không kết nối được FPT AI Factory. Kiểm tra mạng của bạn.",
    connected: "Đã kết nối",
    model: "Mô hình",
    openAgent: "Mở agent",
    changeKey: "Đổi key",
    downloading: "Đang chuẩn bị agent (chỉ lần đầu)…",
    useProxy: "Dùng proxy",
    proxyLabel: "Proxy server (IP:port)",
    errProxy: "Nhập địa chỉ proxy hợp lệ, ví dụ 10.0.0.1:8080",
    errProxyNet: "Không kết nối được FPT AI Factory qua proxy. Kiểm tra lại địa chỉ proxy.",
    viaProxy: "Qua proxy",
    language: "Ngôn ngữ",
  },
  ms: {
    platform: "Platform",
    title: "Masukkan kunci API FPT AI Factory",
    keyLabel: "Kunci API",
    connect: "Sambung",
    checking: "Menyemak…",
    noKey: "Tiada kunci?",
    getKey: "Dapatkan di FPT AI Factory",
    tick1: "Ejen Code / Cowork sedia digunakan (dibalut dengan opencode)",
    tick2: "Menggunakan FPT AI Factory secara lalai",
    tick3: "Model terkini (GLM-5.3, DeepSeek)",
    errEmpty: "Masukkan kunci API anda",
    errInvalid: "Kunci ditolak. Semak dan cuba lagi.",
    errNetwork: "Tidak dapat menghubungi FPT AI Factory. Semak sambungan anda.",
    connected: "Disambungkan",
    model: "Model",
    openAgent: "Buka ejen",
    changeKey: "Tukar kunci",
    downloading: "Menyediakan ejen (kali pertama sahaja)…",
    useProxy: "Gunakan proksi",
    proxyLabel: "Pelayan proksi (IP:port)",
    errProxy: "Masukkan alamat proksi yang sah, cth. 10.0.0.1:8080",
    errProxyNet: "Tidak dapat menghubungi FPT AI Factory melalui proksi. Semak alamat proksi.",
    viaProxy: "Melalui proksi",
    language: "Bahasa",
  },
  ru: {
    platform: "Платформа",
    title: "Введите API-ключ FPT AI Factory",
    keyLabel: "API-ключ",
    connect: "Подключить",
    checking: "Проверка…",
    noKey: "Нет ключа?",
    getKey: "Получите его в FPT AI Factory",
    tick1: "Готовый агент Code / Cowork (на базе opencode)",
    tick2: "По умолчанию работает с FPT AI Factory",
    tick3: "Новейшие модели (GLM-5.3, DeepSeek)",
    errEmpty: "Введите API-ключ",
    errInvalid: "Ключ отклонён. Проверьте его и попробуйте снова.",
    errNetwork: "Не удалось подключиться к FPT AI Factory. Проверьте соединение.",
    connected: "Подключено",
    model: "Модель",
    openAgent: "Открыть агента",
    changeKey: "Сменить ключ",
    downloading: "Подготовка агента (только при первом запуске)…",
    useProxy: "Использовать прокси",
    proxyLabel: "Прокси-сервер (IP:порт)",
    errProxy: "Введите корректный адрес прокси, например 10.0.0.1:8080",
    errProxyNet: "Не удалось подключиться к FPT AI Factory через прокси. Проверьте адрес прокси.",
    viaProxy: "Через прокси",
    language: "Язык",
  },
  ja: {
    platform: "プラットフォーム",
    title: "FPT AI Factory API キーを入力",
    keyLabel: "API キー",
    connect: "接続",
    checking: "確認中…",
    noKey: "キーをお持ちでない場合",
    getKey: "FPT AI Factory で取得",
    tick1: "すぐ使える Code / Cowork エージェント（opencode ベース）",
    tick2: "FPT AI Factory を標準で使用",
    tick3: "最新モデル（GLM-5.3、DeepSeek）",
    errEmpty: "API キーを入力してください",
    errInvalid: "キーが拒否されました。確認して再試行してください。",
    errNetwork: "FPT AI Factory に接続できません。ネットワークを確認してください。",
    connected: "接続済み",
    model: "モデル",
    openAgent: "エージェントを開く",
    changeKey: "キーを変更",
    downloading: "エージェントを準備中（初回のみ）…",
    useProxy: "プロキシを使用",
    proxyLabel: "プロキシサーバー (IP:ポート)",
    errProxy: "有効なプロキシアドレスを入力してください（例: 10.0.0.1:8080）",
    errProxyNet: "プロキシ経由で FPT AI Factory に接続できません。プロキシのアドレスを確認してください。",
    viaProxy: "プロキシ経由",
    language: "言語",
  },
};

export function resolveLang(setting: string, vscodeLang: string): Lang {
  if ((LANGS as readonly string[]).includes(setting)) return setting as Lang;
  const base = vscodeLang.toLowerCase().split("-")[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : "en";
}
