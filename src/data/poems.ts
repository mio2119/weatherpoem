import type { Poem, PoemTags } from "../types";
import { buildPublishedCatalog } from "./content-validation";
import { CONTENT_REVIEWS } from "./content-reviews";
import { EXPANDED_POEMS } from "./poems-expanded";

const EMPTY_TAGS: PoemTags = {
  festivals: [],
  weather: [],
  solarTerms: [],
  seasons: [],
  timePeriods: [],
  emotions: [],
  lifeScenes: [],
};

function poem(
  value: Omit<Poem, "tags" | "quality"> & {
    tags: Partial<PoemTags>;
    quality?: number;
  },
): Poem {
  return {
    ...value,
    quality: value.quality ?? 9,
    tags: {
      festivals: value.tags.festivals ?? EMPTY_TAGS.festivals,
      weather: value.tags.weather ?? EMPTY_TAGS.weather,
      solarTerms: value.tags.solarTerms ?? EMPTY_TAGS.solarTerms,
      seasons: value.tags.seasons ?? EMPTY_TAGS.seasons,
      timePeriods: value.tags.timePeriods ?? EMPTY_TAGS.timePeriods,
      emotions: value.tags.emotions ?? EMPTY_TAGS.emotions,
      lifeScenes: value.tags.lifeScenes ?? EMPTY_TAGS.lifeScenes,
    },
  };
}

const CANDIDATE_POEMS: Poem[] = [
  poem({
    id: "wang-an-shi-yuan-ri",
    title: "元日",
    literaryForm: "七言绝句",
    author: "王安石",
    dynasty: "宋",
    fullText: [
      "爆竹声中一岁除，春风送暖入屠苏。",
      "千门万户曈曈日，总把新桃换旧符。",
    ],
    excerpt: ["千门万户曈曈日", "总把新桃换旧符"],
    sourceName: "《全宋诗》",
    oneLineSummary: "新岁在晨光与新桃中徐徐展开。",
    culturalBackground:
      "诗中写饮屠苏酒、换桃符等宋代新年习俗，也写出了辞旧迎新的公共气象。",
    contemporaryConnection:
      "新年不必只是一句祝福，也可以是一次整理房间、更新计划、重新出发。",
    annotations: [
      { term: "元日", explanation: "农历正月初一。" },
      { term: "曈曈", explanation: "日出时光亮温暖的样子。" },
      { term: "桃符", explanation: "古人新年悬挂在门旁以祈福的桃木板。" },
    ],
    tags: {
      festivals: ["春节"],
      weather: ["clear"],
      solarTerms: ["立春"],
      seasons: ["winter", "spring"],
      timePeriods: ["morning"],
      emotions: ["喜悦", "希望"],
      lifeScenes: ["新年", "焕新"],
    },
    quality: 10,
  }),
  poem({
    id: "su-wei-dao-zheng-yue-shi-wu-ye",
    title: "正月十五夜",
    literaryForm: "五言律诗",
    author: "苏味道",
    dynasty: "唐",
    fullText: [
      "火树银花合，星桥铁锁开。",
      "暗尘随马去，明月逐人来。",
      "游伎皆秾李，行歌尽落梅。",
      "金吾不禁夜，玉漏莫相催。",
    ],
    excerpt: ["火树银花合", "星桥铁锁开"],
    sourceName: "《全唐诗》",
    oneLineSummary: "灯月交辉，把城市照成一场流动的相聚。",
    culturalBackground:
      "唐代元宵前后开放夜禁，市民赏灯夜游，诗中保存了盛大的城市节日景象。",
    contemporaryConnection:
      "灯会、夜游和与朋友相聚，仍是今天进入传统节日最自然的方式。",
    annotations: [
      { term: "火树银花", explanation: "形容灯彩灿烂。" },
      { term: "金吾不禁夜", explanation: "元宵之夜暂时取消宵禁。" },
    ],
    tags: {
      festivals: ["元宵节"],
      weather: ["clear"],
      seasons: ["winter"],
      timePeriods: ["evening", "night"],
      emotions: ["欢聚", "明朗"],
      lifeScenes: ["夜游", "灯会"],
    },
    quality: 10,
  }),
  poem({
    id: "du-mu-qing-ming",
    title: "清明",
    literaryForm: "七言绝句",
    author: "杜牧",
    dynasty: "唐",
    fullText: [
      "清明时节雨纷纷，路上行人欲断魂。",
      "借问酒家何处有？牧童遥指杏花村。",
    ],
    excerpt: ["清明时节雨纷纷", "路上行人欲断魂"],
    sourceName: "《全唐诗》",
    oneLineSummary: "一场春雨，让思念有了可以停驻的地方。",
    culturalBackground:
      "清明兼具节气与慎终追远的节日意味，诗把天气、行旅和人的情绪连在一起。",
    contemporaryConnection:
      "在忙碌的生活里，给思念留出一点安静，也是理解清明的一种方式。",
    annotations: [
      { term: "欲断魂", explanation: "形容心情低落、黯然神伤。" },
      { term: "杏花村", explanation: "杏花深处的村庄，此处代指酒家所在。" },
    ],
    tags: {
      festivals: ["清明节"],
      weather: ["light-rain", "rain"],
      solarTerms: ["清明"],
      seasons: ["spring"],
      timePeriods: ["day"],
      emotions: ["思念", "惆怅"],
      lifeScenes: ["行路", "追思"],
    },
    quality: 10,
  }),
  poem({
    id: "wen-xiu-duan-wu",
    title: "端午",
    literaryForm: "七言绝句",
    author: "文秀",
    dynasty: "唐",
    fullText: [
      "节分端午自谁言，万古传闻为屈原。",
      "堪笑楚江空渺渺，不能洗得直臣冤。",
    ],
    excerpt: ["节分端午自谁言", "万古传闻为屈原"],
    sourceName: "《全唐诗》",
    oneLineSummary: "节日的热闹背后，也保留着对人格与选择的追问。",
    culturalBackground:
      "作品从端午纪念屈原的传说出发，表达对忠直之士的追怀。",
    contemporaryConnection:
      "吃粽子、看龙舟之外，端午也提醒我们理解一个节日为何被长久记住。",
    annotations: [
      { term: "直臣", explanation: "忠直敢谏的臣子，此处指屈原。" },
    ],
    tags: {
      festivals: ["端午节"],
      weather: ["overcast", "rain"],
      solarTerms: ["芒种", "夏至"],
      seasons: ["summer"],
      timePeriods: ["day"],
      emotions: ["追怀", "感慨"],
      lifeScenes: ["节日", "纪念"],
    },
    quality: 9,
  }),
  poem({
    id: "qin-guan-que-qiao-xian",
    title: "鹊桥仙·纤云弄巧",
    literaryForm: "词",
    author: "秦观",
    dynasty: "宋",
    fullText: [
      "纤云弄巧，飞星传恨，银汉迢迢暗度。",
      "金风玉露一相逢，便胜却人间无数。",
      "柔情似水，佳期如梦，忍顾鹊桥归路。",
      "两情若是久长时，又岂在朝朝暮暮。",
    ],
    excerpt: ["两情若是久长时", "又岂在朝朝暮暮"],
    sourceName: "《淮海居士长短句》",
    oneLineSummary: "真正长久的关系，不只由相见的频率定义。",
    culturalBackground:
      "词借牛郎织女七夕相会的传说，写相逢、离别与长久情意。",
    contemporaryConnection:
      "异地、忙碌或短暂分别时，它仍能安放对关系的信任。",
    annotations: [
      { term: "银汉", explanation: "银河。" },
      { term: "金风玉露", explanation: "秋风白露，点明初秋时节。" },
    ],
    tags: {
      festivals: ["七夕节"],
      weather: ["clear"],
      solarTerms: ["立秋", "处暑"],
      seasons: ["autumn"],
      timePeriods: ["night"],
      emotions: ["爱意", "思念"],
      lifeScenes: ["相聚", "异地"],
    },
    quality: 10,
  }),
  poem({
    id: "su-shi-shui-diao-ge-tou",
    title: "水调歌头·明月几时有",
    literaryForm: "词",
    author: "苏轼",
    dynasty: "宋",
    fullText: [
      "明月几时有？把酒问青天。",
      "不知天上宫阙，今夕是何年。",
      "我欲乘风归去，又恐琼楼玉宇，高处不胜寒。",
      "起舞弄清影，何似在人间。",
      "转朱阁，低绮户，照无眠。",
      "不应有恨，何事长向别时圆？",
      "人有悲欢离合，月有阴晴圆缺，此事古难全。",
      "但愿人长久，千里共婵娟。",
    ],
    excerpt: ["但愿人长久", "千里共婵娟"],
    sourceName: "《东坡乐府》",
    oneLineSummary: "共望一轮明月，距离也能变成联结。",
    culturalBackground:
      "苏轼在中秋怀念弟弟，由月的圆缺写到人的离合，最终转向旷达祝愿。",
    contemporaryConnection:
      "不能团聚的时刻，一次问候和共同仰望，也能让关系重新靠近。",
    annotations: [
      { term: "婵娟", explanation: "本指美好姿态，此处代指明月。" },
      { term: "绮户", explanation: "雕花的窗户。" },
    ],
    tags: {
      festivals: ["中秋节"],
      weather: ["clear", "cloudy"],
      solarTerms: ["白露", "秋分"],
      seasons: ["autumn"],
      timePeriods: ["night"],
      emotions: ["思念", "旷达"],
      lifeScenes: ["团聚", "远行"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-wei-jiu-yue-jiu-ri",
    title: "九月九日忆山东兄弟",
    literaryForm: "七言绝句",
    author: "王维",
    dynasty: "唐",
    fullText: [
      "独在异乡为异客，每逢佳节倍思亲。",
      "遥知兄弟登高处，遍插茱萸少一人。",
    ],
    excerpt: ["独在异乡为异客", "每逢佳节倍思亲"],
    sourceName: "《全唐诗》",
    oneLineSummary: "佳节放大了远方，也让牵挂变得清晰。",
    culturalBackground:
      "重阳有登高、佩茱萸等习俗，年轻的王维在异乡写下对家人的思念。",
    contemporaryConnection:
      "离家求学的大学生，会很容易理解节日里那种突然变浓的乡愁。",
    annotations: [
      { term: "山东", explanation: "此处指华山以东，诗人家乡蒲州一带。" },
      { term: "茱萸", explanation: "重阳习俗中佩戴的一种香草。" },
    ],
    tags: {
      festivals: ["重阳节"],
      weather: ["clear", "wind"],
      solarTerms: ["寒露", "霜降"],
      seasons: ["autumn"],
      timePeriods: ["day"],
      emotions: ["思乡", "牵挂"],
      lifeScenes: ["异乡", "登高"],
    },
    quality: 10,
  }),
  poem({
    id: "gao-shi-chu-ye-zuo",
    title: "除夜作",
    literaryForm: "七言绝句",
    author: "高适",
    dynasty: "唐",
    fullText: [
      "旅馆寒灯独不眠，客心何事转凄然。",
      "故乡今夜思千里，霜鬓明朝又一年。",
    ],
    excerpt: ["故乡今夜思千里", "霜鬓明朝又一年"],
    sourceName: "《全唐诗》",
    oneLineSummary: "辞旧的夜里，故乡与时间同时来到心中。",
    culturalBackground:
      "除夕本是团聚之夜，羁旅中的诗人以一盏寒灯写尽未能归家的感受。",
    contemporaryConnection:
      "无法回家的春节，也可以通过一通电话、一次长谈重新确认彼此牵挂。",
    annotations: [
      { term: "除夜", explanation: "除夕夜。" },
      { term: "霜鬓", explanation: "斑白的鬓发，感叹年华流逝。" },
    ],
    tags: {
      festivals: ["除夕"],
      weather: ["cold", "snow"],
      solarTerms: ["大寒"],
      seasons: ["winter"],
      timePeriods: ["night"],
      emotions: ["思乡", "感时"],
      lifeScenes: ["独处", "旅宿"],
    },
    quality: 10,
  }),
  poem({
    id: "han-yu-zao-chun",
    title: "早春呈水部张十八员外",
    literaryForm: "七言绝句",
    author: "韩愈",
    dynasty: "唐",
    fullText: [
      "天街小雨润如酥，草色遥看近却无。",
      "最是一年春好处，绝胜烟柳满皇都。",
    ],
    excerpt: ["天街小雨润如酥", "草色遥看近却无"],
    sourceName: "《全唐诗》",
    oneLineSummary: "春天最先出现的地方，往往要稍微退后一步才能看见。",
    culturalBackground:
      "诗人捕捉初春细雨与若有若无的草色，写的是季节刚刚转身的瞬间。",
    contemporaryConnection:
      "在校园里慢走十分钟，会比天气软件更早发现季节的变化。",
    annotations: [
      { term: "天街", explanation: "京城街道。" },
      { term: "润如酥", explanation: "形容春雨细密滋润。" },
    ],
    tags: {
      weather: ["light-rain"],
      solarTerms: ["雨水", "惊蛰"],
      seasons: ["spring"],
      timePeriods: ["morning", "day"],
      emotions: ["欣喜", "明朗"],
      lifeScenes: ["校园", "散步"],
    },
    quality: 10,
  }),
  poem({
    id: "zhi-nan-jue-ju",
    title: "绝句",
    literaryForm: "七言绝句",
    author: "志南",
    dynasty: "宋",
    fullText: [
      "古木阴中系短篷，杖藜扶我过桥东。",
      "沾衣欲湿杏花雨，吹面不寒杨柳风。",
    ],
    excerpt: ["沾衣欲湿杏花雨", "吹面不寒杨柳风"],
    sourceName: "《宋诗纪事》",
    oneLineSummary: "雨和风都很轻，刚好适合把步子放慢。",
    culturalBackground:
      "杏花雨与杨柳风构成典型江南春景，写出春日出游的舒展。",
    contemporaryConnection:
      "小雨天不一定要匆忙赶路，撑伞散步也可以成为一天的留白。",
    annotations: [
      { term: "短篷", explanation: "有篷的小船。" },
      { term: "杖藜", explanation: "拄着藜杖。" },
    ],
    tags: {
      weather: ["light-rain", "wind"],
      solarTerms: ["春分", "清明"],
      seasons: ["spring"],
      timePeriods: ["day"],
      emotions: ["闲适", "轻快"],
      lifeScenes: ["散步", "出游"],
    },
    quality: 9,
  }),
  poem({
    id: "du-mu-shan-xing",
    title: "山行",
    literaryForm: "七言绝句",
    author: "杜牧",
    dynasty: "唐",
    fullText: [
      "远上寒山石径斜，白云生处有人家。",
      "停车坐爱枫林晚，霜叶红于二月花。",
    ],
    excerpt: ["停车坐爱枫林晚", "霜叶红于二月花"],
    sourceName: "《全唐诗》",
    oneLineSummary: "秋天并非只有萧瑟，也有明亮得让人停下来的颜色。",
    culturalBackground:
      "晚秋霜叶因气温变化转红，诗人以一次驻足重新发现秋景的生命力。",
    contemporaryConnection:
      "路过一片好看的树时允许自己停几分钟，是对日常感受力的保护。",
    annotations: [
      { term: "坐", explanation: "因为。" },
      { term: "寒山", explanation: "深秋时节的山。" },
    ],
    tags: {
      weather: ["clear", "cold"],
      solarTerms: ["寒露", "霜降"],
      seasons: ["autumn"],
      timePeriods: ["evening"],
      emotions: ["赞叹", "明朗"],
      lifeScenes: ["登山", "驻足"],
    },
    quality: 10,
  }),
  poem({
    id: "liu-zong-yuan-jiang-xue",
    title: "江雪",
    literaryForm: "五言绝句",
    author: "柳宗元",
    dynasty: "唐",
    fullText: [
      "千山鸟飞绝，万径人踪灭。",
      "孤舟蓑笠翁，独钓寒江雪。",
    ],
    excerpt: ["孤舟蓑笠翁", "独钓寒江雪"],
    sourceName: "《全唐诗》",
    oneLineSummary: "大雪收去喧响，留下一个不被环境改变的身影。",
    culturalBackground:
      "诗作于柳宗元被贬永州期间，以极静的雪景寄托孤高坚守。",
    contemporaryConnection:
      "外部评价很嘈杂时，专注完成眼前的一件事，也是一种安定。",
    annotations: [
      { term: "蓑笠", explanation: "蓑衣和斗笠，都是雨雪天的用具。" },
    ],
    tags: {
      weather: ["snow", "cold"],
      solarTerms: ["大雪", "冬至", "小寒"],
      seasons: ["winter"],
      timePeriods: ["day"],
      emotions: ["孤独", "坚守"],
      lifeScenes: ["独处", "专注"],
    },
    quality: 10,
  }),
  poem({
    id: "su-shi-yin-hu-shang",
    title: "饮湖上初晴后雨",
    literaryForm: "七言绝句",
    author: "苏轼",
    dynasty: "宋",
    fullText: [
      "水光潋滟晴方好，山色空蒙雨亦奇。",
      "欲把西湖比西子，淡妆浓抹总相宜。",
    ],
    excerpt: ["水光潋滟晴方好", "山色空蒙雨亦奇"],
    sourceName: "《全宋诗》",
    oneLineSummary: "晴雨各有神情，变化本身就是风景。",
    culturalBackground:
      "苏轼写西湖由晴转雨，以西施作比，赞美不同状态中的自然之美。",
    contemporaryConnection:
      "天气改变计划时，也许可以换一种节奏，而不是认定这一天被打乱了。",
    annotations: [
      { term: "潋滟", explanation: "水面波光闪动的样子。" },
      { term: "空蒙", explanation: "雨雾迷蒙。" },
    ],
    tags: {
      weather: ["clear", "light-rain", "rain", "fog"],
      solarTerms: ["谷雨", "小满"],
      seasons: ["spring", "summer"],
      timePeriods: ["day"],
      emotions: ["欣赏", "旷达"],
      lifeScenes: ["湖边", "出游"],
    },
    quality: 10,
  }),
  poem({
    id: "zhang-ji-feng-qiao-ye-bo",
    title: "枫桥夜泊",
    literaryForm: "七言绝句",
    author: "张继",
    dynasty: "唐",
    fullText: [
      "月落乌啼霜满天，江枫渔火对愁眠。",
      "姑苏城外寒山寺，夜半钟声到客船。",
    ],
    excerpt: ["姑苏城外寒山寺", "夜半钟声到客船"],
    sourceName: "《全唐诗》",
    oneLineSummary: "睡不着的夜里，远处钟声让时间有了形状。",
    culturalBackground:
      "旅夜停舟、月落霜寒与寺钟共同构成江南夜景，也保存了羁旅人的愁绪。",
    contemporaryConnection:
      "失眠时不必急着对抗，听一听窗外的声音，也能让情绪慢慢落地。",
    annotations: [
      { term: "夜泊", explanation: "夜晚把船停靠岸边。" },
      { term: "渔火", explanation: "渔船上的灯火。" },
    ],
    tags: {
      weather: ["clear", "cold", "fog"],
      solarTerms: ["霜降"],
      seasons: ["autumn", "winter"],
      timePeriods: ["night"],
      emotions: ["愁思", "安静"],
      lifeScenes: ["失眠", "旅途"],
    },
    quality: 10,
  }),
  poem({
    id: "meng-hao-ran-chun-xiao",
    title: "春晓",
    literaryForm: "五言绝句",
    author: "孟浩然",
    dynasty: "唐",
    fullText: [
      "春眠不觉晓，处处闻啼鸟。",
      "夜来风雨声，花落知多少。",
    ],
    excerpt: ["春眠不觉晓", "处处闻啼鸟"],
    sourceName: "《全唐诗》",
    oneLineSummary: "从睡梦醒来，先听见春天，再想起昨夜的风雨。",
    culturalBackground:
      "短短二十字由晨起听觉转向对落花的想象，呈现春日细微的惜意。",
    contemporaryConnection:
      "起床后先听一会儿环境，而不是立刻看手机，清晨会有不同质地。",
    annotations: [
      { term: "晓", explanation: "天刚亮的时候。" },
    ],
    tags: {
      weather: ["light-rain", "rain", "wind", "clear"],
      solarTerms: ["惊蛰", "春分"],
      seasons: ["spring"],
      timePeriods: ["morning"],
      emotions: ["慵懒", "惜春"],
      lifeScenes: ["晨起", "宿舍"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-chang-ling-fu-rong-lou",
    title: "芙蓉楼送辛渐",
    literaryForm: "七言绝句",
    author: "王昌龄",
    dynasty: "唐",
    fullText: [
      "寒雨连江夜入吴，平明送客楚山孤。",
      "洛阳亲友如相问，一片冰心在玉壶。",
    ],
    excerpt: ["洛阳亲友如相问", "一片冰心在玉壶"],
    sourceName: "《全唐诗》",
    oneLineSummary: "在雨夜送别之后，把坦荡留作最简洁的自我说明。",
    culturalBackground:
      "诗人以寒雨孤山衬托送别，并以冰心玉壶表明清白自守。",
    contemporaryConnection:
      "面对误解时，不必过度解释；持续诚实地行动，也是回答。",
    annotations: [
      { term: "平明", explanation: "天刚亮。" },
      { term: "冰心", explanation: "比喻纯洁澄澈的内心。" },
    ],
    tags: {
      weather: ["rain", "cold"],
      solarTerms: ["寒露", "小寒"],
      seasons: ["autumn", "winter"],
      timePeriods: ["morning", "night"],
      emotions: ["送别", "坚定"],
      lifeScenes: ["离别", "误解"],
    },
    quality: 10,
  }),
  poem({
    id: "liu-yu-xi-qiu-ci",
    title: "秋词",
    literaryForm: "七言绝句",
    author: "刘禹锡",
    dynasty: "唐",
    fullText: [
      "自古逢秋悲寂寥，我言秋日胜春朝。",
      "晴空一鹤排云上，便引诗情到碧霄。",
    ],
    excerpt: ["晴空一鹤排云上", "便引诗情到碧霄"],
    sourceName: "《全唐诗》",
    oneLineSummary: "清秋也可以向上，不必沿用别人规定的情绪。",
    culturalBackground:
      "诗人反转传统悲秋主题，以晴空飞鹤写昂扬开阔的精神。",
    contemporaryConnection:
      "当周围人都说某段日子很难熬时，你仍可以形成自己的感受和节奏。",
    annotations: [
      { term: "排云", explanation: "冲开云层。" },
      { term: "碧霄", explanation: "青天。" },
    ],
    tags: {
      weather: ["clear", "wind"],
      solarTerms: ["白露", "秋分"],
      seasons: ["autumn"],
      timePeriods: ["day"],
      emotions: ["昂扬", "开阔"],
      lifeScenes: ["振作", "远望"],
    },
    quality: 10,
  }),
  poem({
    id: "bai-ju-yi-wen-liu-shi-jiu",
    title: "问刘十九",
    literaryForm: "五言绝句",
    author: "白居易",
    dynasty: "唐",
    fullText: [
      "绿蚁新醅酒，红泥小火炉。",
      "晚来天欲雪，能饮一杯无？",
    ],
    excerpt: ["晚来天欲雪", "能饮一杯无"],
    sourceName: "《全唐诗》",
    oneLineSummary: "天将下雪，一句简单邀请就足以温暖傍晚。",
    culturalBackground:
      "新酒、火炉与暮雪构成亲切的冬日生活场景，语言近乎日常问候。",
    contemporaryConnection:
      "与其等一场隆重聚会，不如主动问朋友：今晚一起吃点东西吗？",
    annotations: [
      { term: "绿蚁", explanation: "新酿米酒表面细小的绿色泡沫。" },
      { term: "醅", explanation: "未过滤的酒。" },
    ],
    tags: {
      weather: ["snow", "cold", "overcast"],
      solarTerms: ["小雪", "大雪"],
      seasons: ["winter"],
      timePeriods: ["evening"],
      emotions: ["温暖", "期待"],
      lifeScenes: ["邀友", "晚餐"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-zhi-huan-deng-guan-que-lou",
    title: "登鹳雀楼",
    literaryForm: "五言绝句",
    author: "王之涣",
    dynasty: "唐",
    fullText: [
      "白日依山尽，黄河入海流。",
      "欲穷千里目，更上一层楼。",
    ],
    excerpt: ["欲穷千里目", "更上一层楼"],
    sourceName: "《全唐诗》",
    oneLineSummary: "视野的变化，有时只差再向前走一层。",
    culturalBackground:
      "诗从日落黄河的壮阔景象转入登高哲思，空间与行动彼此推动。",
    contemporaryConnection:
      "遇到卡住的问题时，换一个资料来源、找一个人讨论，可能就是那一层楼。",
    annotations: [
      { term: "穷", explanation: "尽，达到极点。" },
    ],
    tags: {
      weather: ["clear"],
      solarTerms: [],
      seasons: ["spring", "summer", "autumn", "winter"],
      timePeriods: ["evening"],
      emotions: ["进取", "开阔"],
      lifeScenes: ["学习", "登高"],
    },
    quality: 10,
  }),
  poem({
    id: "li-bai-jing-ye-si",
    title: "静夜思",
    literaryForm: "五言绝句",
    author: "李白",
    dynasty: "唐",
    fullText: [
      "床前明月光，疑是地上霜。",
      "举头望明月，低头思故乡。",
    ],
    excerpt: ["举头望明月", "低头思故乡"],
    sourceName: "《全唐诗》",
    oneLineSummary: "月光让一个普通夜晚突然通向故乡。",
    culturalBackground:
      "诗以极简动作完成从眼前月色到内心乡思的转换，成为最普遍的离乡经验。",
    contemporaryConnection:
      "离家求学后，某个熟悉的气味或月色，都可能让家忽然变得很近。",
    annotations: [
      { term: "疑", explanation: "好像，以为。" },
    ],
    tags: {
      festivals: ["中秋节"],
      weather: ["clear", "cold"],
      seasons: ["autumn", "winter"],
      timePeriods: ["night"],
      emotions: ["思乡", "安静"],
      lifeScenes: ["宿舍", "独处"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-bo-song-du-shao-fu",
    title: "送杜少府之任蜀州",
    literaryForm: "五言律诗",
    author: "王勃",
    dynasty: "唐",
    fullText: [
      "城阙辅三秦，风烟望五津。",
      "与君离别意，同是宦游人。",
      "海内存知己，天涯若比邻。",
      "无为在歧路，儿女共沾巾。",
    ],
    excerpt: ["海内存知己", "天涯若比邻"],
    sourceName: "《全唐诗》",
    oneLineSummary: "真正的朋友，不会被毕业、远行或距离轻易冲淡。",
    culturalBackground:
      "初唐送别诗一改缠绵伤感，以开阔胸襟理解友情与远行。",
    contemporaryConnection:
      "毕业季、交换学习或朋友转学时，它仍是一句不落俗套的祝福。",
    annotations: [
      { term: "之任", explanation: "赴任。" },
      { term: "比邻", explanation: "近邻。" },
    ],
    tags: {
      weather: ["wind", "cloudy"],
      seasons: ["spring", "autumn"],
      timePeriods: ["day"],
      emotions: ["友情", "旷达"],
      lifeScenes: ["毕业", "送别"],
    },
    quality: 10,
  }),
  poem({
    id: "su-shi-ding-feng-bo",
    title: "定风波·莫听穿林打叶声",
    literaryForm: "词",
    author: "苏轼",
    dynasty: "宋",
    fullText: [
      "莫听穿林打叶声，何妨吟啸且徐行。",
      "竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。",
      "料峭春风吹酒醒，微冷，山头斜照却相迎。",
      "回首向来萧瑟处，归去，也无风雨也无晴。",
    ],
    excerpt: ["竹杖芒鞋轻胜马", "一蓑烟雨任平生"],
    sourceName: "《东坡乐府》",
    oneLineSummary: "风雨来时仍能徐行，是一种具体而轻盈的从容。",
    culturalBackground:
      "苏轼途中遇雨，借日常行路写面对人生风雨的旷达态度。",
    contemporaryConnection:
      "计划受挫时先把下一步走稳，常常比急于证明一切都没问题更有力量。",
    annotations: [
      { term: "吟啸", explanation: "吟诗长啸。" },
      { term: "芒鞋", explanation: "草鞋。" },
    ],
    tags: {
      weather: ["rain", "wind", "light-rain"],
      solarTerms: ["惊蛰", "春分"],
      seasons: ["spring"],
      timePeriods: ["day", "evening"],
      emotions: ["从容", "旷达"],
      lifeScenes: ["挫折", "行路"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-an-shi-mei-hua",
    title: "梅花",
    literaryForm: "五言绝句",
    author: "王安石",
    dynasty: "宋",
    fullText: [
      "墙角数枝梅，凌寒独自开。",
      "遥知不是雪，为有暗香来。",
    ],
    excerpt: ["墙角数枝梅", "凌寒独自开"],
    sourceName: "《全宋诗》",
    oneLineSummary: "安静开放的事物，也会用自己的方式抵达别人。",
    culturalBackground:
      "梅花凌寒开放，在传统文化中常被赋予坚贞、高洁的品格意味。",
    contemporaryConnection:
      "不被注意的积累并非没有价值，稳定做好一件事，自会留下气息。",
    annotations: [
      { term: "凌寒", explanation: "冒着严寒。" },
      { term: "暗香", explanation: "清幽的香气。" },
    ],
    tags: {
      weather: ["cold", "snow"],
      solarTerms: ["小寒", "大寒"],
      seasons: ["winter"],
      timePeriods: ["morning", "day"],
      emotions: ["坚定", "安静"],
      lifeScenes: ["独处", "积累"],
    },
    quality: 10,
  }),
  poem({
    id: "du-fu-chun-ye-xi-yu",
    title: "春夜喜雨",
    literaryForm: "五言律诗",
    author: "杜甫",
    dynasty: "唐",
    fullText: [
      "好雨知时节，当春乃发生。",
      "随风潜入夜，润物细无声。",
      "野径云俱黑，江船火独明。",
      "晓看红湿处，花重锦官城。",
    ],
    excerpt: ["随风潜入夜", "润物细无声"],
    sourceName: "《全唐诗》",
    oneLineSummary: "真正有效的滋养，常常安静得不被立即察觉。",
    culturalBackground:
      "杜甫在成都草堂写春雨及时而来，从夜雨推想到清晨繁花。",
    contemporaryConnection:
      "读书、运动和一段可靠关系的作用，也常在日复一日中慢慢显现。",
    annotations: [
      { term: "发生", explanation: "催发植物生长。" },
      { term: "花重", explanation: "花朵饱含雨水而显得沉甸甸。" },
    ],
    tags: {
      weather: ["light-rain", "rain", "overcast"],
      solarTerms: ["雨水", "惊蛰"],
      seasons: ["spring"],
      timePeriods: ["night", "morning"],
      emotions: ["欣喜", "期待"],
      lifeScenes: ["成长", "夜读"],
    },
    quality: 10,
  }),
  poem({
    id: "bai-ju-yi-mu-jiang-yin",
    title: "暮江吟",
    literaryForm: "七言绝句",
    author: "白居易",
    dynasty: "唐",
    fullText: [
      "一道残阳铺水中，半江瑟瑟半江红。",
      "可怜九月初三夜，露似真珠月似弓。",
    ],
    excerpt: ["一道残阳铺水中", "半江瑟瑟半江红"],
    sourceName: "《全唐诗》",
    oneLineSummary: "傍晚到初夜，颜色与光线把同一条江重新画了一遍。",
    culturalBackground:
      "作品连续捕捉日落、江色、露珠和新月，呈现秋夜的细致层次。",
    contemporaryConnection:
      "下课后抬头看一次天色，能把被课程切碎的一天重新接起来。",
    annotations: [
      { term: "瑟瑟", explanation: "此处形容碧绿色。" },
      { term: "可怜", explanation: "可爱，令人怜爱。" },
    ],
    tags: {
      weather: ["clear"],
      solarTerms: ["白露", "寒露"],
      seasons: ["autumn"],
      timePeriods: ["evening", "night"],
      emotions: ["喜爱", "宁静"],
      lifeScenes: ["下课", "江边"],
    },
    quality: 10,
  }),
  poem({
    id: "lin-bu-shan-yuan-xiao-mei",
    title: "山园小梅",
    literaryForm: "七言律诗",
    author: "林逋",
    dynasty: "宋",
    fullText: [
      "众芳摇落独暄妍，占尽风情向小园。",
      "疏影横斜水清浅，暗香浮动月黄昏。",
      "霜禽欲下先偷眼，粉蝶如知合断魂。",
      "幸有微吟可相狎，不须檀板共金尊。",
    ],
    excerpt: ["疏影横斜水清浅", "暗香浮动月黄昏"],
    sourceName: "《全宋诗》",
    oneLineSummary: "疏影与暗香，让冬日黄昏有了很轻的层次。",
    culturalBackground:
      "林逋隐居西湖孤山，咏梅名句将视觉与嗅觉结合，影响后世梅花书写。",
    contemporaryConnection:
      "审美不一定来自宏大景观，也可以来自桌上一枝花或窗边一束影。",
    annotations: [
      { term: "暄妍", explanation: "明媚鲜丽。" },
      { term: "相狎", explanation: "亲近相伴。" },
    ],
    tags: {
      weather: ["cold", "clear", "fog"],
      solarTerms: ["小寒", "大寒"],
      seasons: ["winter"],
      timePeriods: ["evening"],
      emotions: ["清雅", "自得"],
      lifeScenes: ["独处", "赏花"],
    },
    quality: 10,
  }),
  poem({
    id: "yang-wan-li-xiao-chu-jing-ci-si",
    title: "晓出净慈寺送林子方",
    literaryForm: "七言绝句",
    author: "杨万里",
    dynasty: "宋",
    fullText: [
      "毕竟西湖六月中，风光不与四时同。",
      "接天莲叶无穷碧，映日荷花别样红。",
    ],
    excerpt: ["接天莲叶无穷碧", "映日荷花别样红"],
    sourceName: "《全宋诗》",
    oneLineSummary: "盛夏把绿色与红色推到最饱满的程度。",
    culturalBackground:
      "诗以大面积荷叶与映日荷花，写出六月西湖明亮而旺盛的生命力。",
    contemporaryConnection:
      "炎热天气里，去有树荫和水面的地方走走，比一直待在空调房更能感知夏天。",
    annotations: [
      { term: "四时", explanation: "四季。" },
      { term: "别样", explanation: "特别，不同寻常。" },
    ],
    tags: {
      weather: ["clear", "hot"],
      solarTerms: ["夏至", "小暑"],
      seasons: ["summer"],
      timePeriods: ["morning", "day"],
      emotions: ["明朗", "赞叹"],
      lifeScenes: ["湖边", "出游"],
    },
    quality: 10,
  }),
  poem({
    id: "he-zhi-zhang-yong-liu",
    title: "咏柳",
    literaryForm: "七言绝句",
    author: "贺知章",
    dynasty: "唐",
    fullText: [
      "碧玉妆成一树高，万条垂下绿丝绦。",
      "不知细叶谁裁出，二月春风似剪刀。",
    ],
    excerpt: ["不知细叶谁裁出", "二月春风似剪刀"],
    sourceName: "《全唐诗》",
    oneLineSummary: "春风像一把看不见的剪刀，让新叶有了精巧轮廓。",
    culturalBackground:
      "诗以碧玉、丝带和剪刀作比，赞美早春柳树的新鲜与轻盈。",
    contemporaryConnection:
      "熟悉的校园道路，也会因为第一批新叶而像换了一个场景。",
    annotations: [
      { term: "丝绦", explanation: "丝织的带子。" },
      { term: "二月", explanation: "农历二月，已进入仲春。" },
    ],
    tags: {
      weather: ["wind", "clear"],
      solarTerms: ["立春", "雨水", "惊蛰"],
      seasons: ["spring"],
      timePeriods: ["day"],
      emotions: ["欣喜", "轻快"],
      lifeScenes: ["校园", "观察"],
    },
    quality: 10,
  }),
  poem({
    id: "wang-wei-niao-ming-jian",
    title: "鸟鸣涧",
    literaryForm: "五言绝句",
    author: "王维",
    dynasty: "唐",
    fullText: [
      "人闲桂花落，夜静春山空。",
      "月出惊山鸟，时鸣春涧中。",
    ],
    excerpt: ["月出惊山鸟", "时鸣春涧中"],
    sourceName: "《全唐诗》",
    oneLineSummary: "越安静，越能听见细小事物的发生。",
    culturalBackground:
      "王维以花落、月出、鸟鸣等微小动态反衬春山夜晚的幽静。",
    contemporaryConnection:
      "摘下耳机走一段路，环境中的风、树叶和脚步声会重新回来。",
    annotations: [
      { term: "人闲", explanation: "人心闲静。" },
      { term: "时鸣", explanation: "偶尔鸣叫。" },
    ],
    tags: {
      weather: ["clear"],
      solarTerms: ["春分", "谷雨"],
      seasons: ["spring"],
      timePeriods: ["night"],
      emotions: ["宁静", "专注"],
      lifeScenes: ["散步", "独处"],
    },
    quality: 10,
  }),
  poem({
    id: "liu-chang-qing-feng-xue",
    title: "逢雪宿芙蓉山主人",
    literaryForm: "五言绝句",
    author: "刘长卿",
    dynasty: "唐",
    fullText: [
      "日暮苍山远，天寒白屋贫。",
      "柴门闻犬吠，风雪夜归人。",
    ],
    excerpt: ["柴门闻犬吠", "风雪夜归人"],
    sourceName: "《全唐诗》",
    oneLineSummary: "风雪夜归，一声犬吠让寒冷的画面有了人间气息。",
    culturalBackground:
      "暮色、寒山、白屋与归人构成极简叙事，写旅途中借宿所见。",
    contemporaryConnection:
      "冬夜回到亮着灯的宿舍，普通的归来本身也带着安稳。",
    annotations: [
      { term: "白屋", explanation: "简朴的茅屋。" },
      { term: "夜归人", explanation: "夜间冒着风雪归来的人。" },
    ],
    tags: {
      weather: ["snow", "wind", "cold"],
      solarTerms: ["大雪", "冬至"],
      seasons: ["winter"],
      timePeriods: ["evening", "night"],
      emotions: ["安稳", "孤清"],
      lifeScenes: ["归家", "旅宿"],
    },
    quality: 10,
  }),
  poem({
    id: "li-bai-zao-fa-bai-di-cheng",
    title: "早发白帝城",
    literaryForm: "七言绝句",
    author: "李白",
    dynasty: "唐",
    fullText: [
      "朝辞白帝彩云间，千里江陵一日还。",
      "两岸猿声啼不住，轻舟已过万重山。",
    ],
    excerpt: ["两岸猿声啼不住", "轻舟已过万重山"],
    sourceName: "《全唐诗》",
    oneLineSummary: "走过最难的一段，舟行忽然变得轻快。",
    culturalBackground:
      "李白流放途中遇赦东归，以疾驰轻舟写摆脱困境后的畅快。",
    contemporaryConnection:
      "交完大作业、结束考试周的清晨，很适合感受这种轻舟已过的松快。",
    annotations: [
      { term: "朝辞", explanation: "清晨告别。" },
      { term: "江陵", explanation: "今湖北荆州一带。" },
    ],
    tags: {
      weather: ["clear", "cloudy"],
      seasons: ["spring", "summer", "autumn"],
      timePeriods: ["morning"],
      emotions: ["轻快", "释然"],
      lifeScenes: ["考试", "出发"],
    },
    quality: 10,
  }),
  poem({
    id: "li-qing-zhao-ru-meng-ling",
    title: "如梦令·昨夜雨疏风骤",
    literaryForm: "词",
    author: "李清照",
    dynasty: "宋",
    fullText: [
      "昨夜雨疏风骤，浓睡不消残酒。",
      "试问卷帘人，却道海棠依旧。",
      "知否，知否？应是绿肥红瘦。",
    ],
    excerpt: ["知否，知否", "应是绿肥红瘦"],
    sourceName: "《漱玉词》",
    oneLineSummary: "一夜风雨之后，最先被惦记的是窗外海棠。",
    culturalBackground:
      "词用主仆问答写惜花心情，“绿肥红瘦”精炼呈现暮春景象。",
    contemporaryConnection:
      "真正的观察不是只看天气结果，而是关心一场风雨改变了什么。",
    annotations: [
      { term: "雨疏风骤", explanation: "雨点稀疏而风势急猛。" },
      { term: "绿肥红瘦", explanation: "绿叶繁茂、红花凋零。" },
    ],
    tags: {
      weather: ["rain", "wind", "heavy-rain"],
      solarTerms: ["谷雨", "立夏"],
      seasons: ["spring"],
      timePeriods: ["morning"],
      emotions: ["惜春", "关切"],
      lifeScenes: ["晨起", "观察"],
    },
    quality: 10,
  }),
  poem({
    id: "fan-zhong-yan-su-mu-zhe",
    title: "苏幕遮·怀旧",
    literaryForm: "词",
    author: "范仲淹",
    dynasty: "宋",
    fullText: [
      "碧云天，黄叶地，秋色连波，波上寒烟翠。",
      "山映斜阳天接水，芳草无情，更在斜阳外。",
      "黯乡魂，追旅思，夜夜除非，好梦留人睡。",
      "明月楼高休独倚，酒入愁肠，化作相思泪。",
    ],
    excerpt: ["碧云天，黄叶地", "秋色连波，波上寒烟翠"],
    sourceName: "《范文正公词》",
    oneLineSummary: "辽阔秋色越是明净，远行人的乡思越显得深。",
    culturalBackground:
      "词先铺写碧云黄叶、斜阳秋水，再转入羁旅乡愁，景与情层层相接。",
    contemporaryConnection:
      "远离家乡后的想念不必回避，它也是我们确认归属的一种方式。",
    annotations: [
      { term: "黯乡魂", explanation: "思乡而心情黯然。" },
      { term: "追旅思", explanation: "羁旅愁思绵延不绝。" },
    ],
    tags: {
      weather: ["clear", "fog", "cold"],
      solarTerms: ["白露", "寒露"],
      seasons: ["autumn"],
      timePeriods: ["evening", "night"],
      emotions: ["思乡", "惆怅"],
      lifeScenes: ["远行", "独处"],
    },
    quality: 9,
  }),
  poem({
    id: "zhao-shi-xiu-yue-ke",
    title: "约客",
    literaryForm: "七言绝句",
    author: "赵师秀",
    dynasty: "宋",
    fullText: [
      "黄梅时节家家雨，青草池塘处处蛙。",
      "有约不来过夜半，闲敲棋子落灯花。",
    ],
    excerpt: ["黄梅时节家家雨", "青草池塘处处蛙"],
    sourceName: "《清苑斋集》",
    oneLineSummary: "夏雨拉长了等待，也让蛙声和灯花变得清晰。",
    culturalBackground:
      "江南梅雨季连日阴雨，诗人在夜半等候友人，以敲棋子的细节写等待中的闲闷。",
    contemporaryConnection:
      "约好的人迟到、计划被雨打乱时，留意手边的小事，也能让等待不只剩焦躁。",
    annotations: [
      { term: "黄梅时节", explanation: "江南初夏梅子成熟、阴雨连绵的时节。" },
      { term: "灯花", explanation: "灯芯燃烧后结成的花状物。" },
    ],
    tags: {
      weather: ["overcast", "light-rain", "rain"],
      solarTerms: ["芒种", "夏至", "小暑", "大暑"],
      seasons: ["summer"],
      timePeriods: ["evening", "night"],
      emotions: ["闲适", "等待"],
      lifeScenes: ["等人", "独处"],
    },
    quality: 10,
  }),
];

export const POEMS = buildPublishedCatalog(
  [...CANDIDATE_POEMS, ...EXPANDED_POEMS],
  CONTENT_REVIEWS,
);

export function findPoem(workId: string | undefined): Poem | undefined {
  return POEMS.find((item) => item.id === workId);
}
