export type TaxonomyNode = { code: string; label: string; parent: string | null; level: number };
export type LocationNode = { code: string; label: string; parent: string | null };

export const INDUSTRY_TAXONOMY: TaxonomyNode[] = [
  { code: "TECH", label: "信息技术", parent: null, level: 1 },
  { code: "TECH.SOFTWARE", label: "软件与 SaaS", parent: "TECH", level: 2 },
  { code: "TECH.AI", label: "人工智能与数据", parent: "TECH", level: 2 },
  { code: "TECH.HARDWARE", label: "硬件与电子", parent: "TECH", level: 2 },
  { code: "MANUFACTURING", label: "制造业", parent: null, level: 1 },
  { code: "MANUFACTURING.INDUSTRIAL", label: "工业设备", parent: "MANUFACTURING", level: 2 },
  { code: "MANUFACTURING.AUTO", label: "汽车与交通设备", parent: "MANUFACTURING", level: 2 },
  { code: "MANUFACTURING.CONSUMER", label: "消费品制造", parent: "MANUFACTURING", level: 2 },
  { code: "PROFESSIONAL", label: "专业服务", parent: null, level: 1 },
  { code: "PROFESSIONAL.CONSULTING", label: "咨询与研究", parent: "PROFESSIONAL", level: 2 },
  { code: "PROFESSIONAL.DESIGN", label: "设计与创意服务", parent: "PROFESSIONAL", level: 2 },
  { code: "PROFESSIONAL.LEGAL", label: "法律与会计", parent: "PROFESSIONAL", level: 2 },
  { code: "MEDIA", label: "媒体与娱乐", parent: null, level: 1 },
  { code: "MEDIA.GAMES", label: "游戏与互动娱乐", parent: "MEDIA", level: 2 },
  { code: "MEDIA.FILM", label: "影视与内容制作", parent: "MEDIA", level: 2 },
  { code: "MEDIA.ADVERTISING", label: "广告与营销", parent: "MEDIA", level: 2 },
  { code: "RETAIL", label: "零售与消费", parent: null, level: 1 },
  { code: "RETAIL.ECOMMERCE", label: "电子商务", parent: "RETAIL", level: 2 },
  { code: "RETAIL.LUXURY", label: "奢侈品与时尚", parent: "RETAIL", level: 2 },
  { code: "RETAIL.FOOD", label: "食品与餐饮", parent: "RETAIL", level: 2 },
  { code: "FINANCE", label: "金融服务", parent: null, level: 1 },
  { code: "FINANCE.BANKING", label: "银行与保险", parent: "FINANCE", level: 2 },
  { code: "FINANCE.INVESTMENT", label: "投资与资产管理", parent: "FINANCE", level: 2 },
  { code: "HEALTH", label: "医疗健康", parent: null, level: 1 },
  { code: "HEALTH.MEDICAL", label: "医疗服务", parent: "HEALTH", level: 2 },
  { code: "HEALTH.PHARMA", label: "制药与生命科学", parent: "HEALTH", level: 2 },
  { code: "EDUCATION", label: "教育与培训", parent: null, level: 1 },
  { code: "REAL_ESTATE", label: "房地产与建筑", parent: null, level: 1 },
  { code: "LOGISTICS", label: "物流与供应链", parent: null, level: 1 },
  { code: "ENERGY", label: "能源与环境", parent: null, level: 1 },
  { code: "PUBLIC", label: "政府与非营利组织", parent: null, level: 1 },
  { code: "OTHER", label: "其他", parent: null, level: 1 },
];

const ISO_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

const countryNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
export const COUNTRIES: LocationNode[] = ISO_CODES.map((code) => ({ code, label: countryNames.of(code) || code, parent: null }));

export const REGIONS: LocationNode[] = [
  { code: "CN-11", label: "北京市", parent: "CN" }, { code: "CN-31", label: "上海市", parent: "CN" }, { code: "CN-44", label: "广东省", parent: "CN" }, { code: "CN-32", label: "江苏省", parent: "CN" }, { code: "CN-33", label: "浙江省", parent: "CN" }, { code: "CN-51", label: "四川省", parent: "CN" }, { code: "CN-42", label: "湖北省", parent: "CN" }, { code: "CN-37", label: "山东省", parent: "CN" },
  { code: "US-CA", label: "California", parent: "US" }, { code: "US-NY", label: "New York", parent: "US" }, { code: "US-TX", label: "Texas", parent: "US" }, { code: "US-WA", label: "Washington", parent: "US" },
  { code: "CA-ON", label: "Ontario", parent: "CA" }, { code: "CA-BC", label: "British Columbia", parent: "CA" }, { code: "AU-NSW", label: "New South Wales", parent: "AU" }, { code: "AU-VIC", label: "Victoria", parent: "AU" },
  { code: "JP-13", label: "東京都", parent: "JP" }, { code: "JP-27", label: "大阪府", parent: "JP" }, { code: "IN-DL", label: "Delhi", parent: "IN" }, { code: "IN-MH", label: "Maharashtra", parent: "IN" },
];

export const CITIES: LocationNode[] = [
  { code: "CN-11-BEIJING", label: "北京", parent: "CN-11" }, { code: "CN-31-SHANGHAI", label: "上海", parent: "CN-31" }, { code: "CN-44-GUANGZHOU", label: "广州", parent: "CN-44" }, { code: "CN-44-SHENZHEN", label: "深圳", parent: "CN-44" }, { code: "CN-32-NANJING", label: "南京", parent: "CN-32" }, { code: "CN-32-SUZHOU", label: "苏州", parent: "CN-32" }, { code: "CN-33-HANGZHOU", label: "杭州", parent: "CN-33" }, { code: "CN-51-CHENGDU", label: "成都", parent: "CN-51" },
  { code: "US-CA-SF", label: "San Francisco", parent: "US-CA" }, { code: "US-CA-LA", label: "Los Angeles", parent: "US-CA" }, { code: "US-NY-NYC", label: "New York City", parent: "US-NY" }, { code: "US-TX-AUSTIN", label: "Austin", parent: "US-TX" }, { code: "US-WA-SEATTLE", label: "Seattle", parent: "US-WA" },
  { code: "CA-ON-TORONTO", label: "Toronto", parent: "CA-ON" }, { code: "CA-BC-VANCOUVER", label: "Vancouver", parent: "CA-BC" }, { code: "AU-NSW-SYDNEY", label: "Sydney", parent: "AU-NSW" }, { code: "AU-VIC-MELBOURNE", label: "Melbourne", parent: "AU-VIC" },
  { code: "JP-13-TOKYO", label: "东京", parent: "JP-13" }, { code: "JP-27-OSAKA", label: "大阪", parent: "JP-27" }, { code: "IN-DL-DELHI", label: "Delhi", parent: "IN-DL" }, { code: "IN-MH-MUMBAI", label: "Mumbai", parent: "IN-MH" },
  { code: "OTHER", label: "其他 / 自定义", parent: null },
];
