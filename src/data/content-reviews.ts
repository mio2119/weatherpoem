import type { ContentReview } from "../types";
import { EXPANDED_WORK_IDS } from "./expanded-work-ids";

const PUBLISHED_WORK_IDS = [
  "wang-an-shi-yuan-ri",
  "su-wei-dao-zheng-yue-shi-wu-ye",
  "du-mu-qing-ming",
  "wen-xiu-duan-wu",
  "qin-guan-que-qiao-xian",
  "su-shi-shui-diao-ge-tou",
  "wang-wei-jiu-yue-jiu-ri",
  "gao-shi-chu-ye-zuo",
  "han-yu-zao-chun",
  "zhi-nan-jue-ju",
  "du-mu-shan-xing",
  "liu-zong-yuan-jiang-xue",
  "su-shi-yin-hu-shang",
  "zhang-ji-feng-qiao-ye-bo",
  "meng-hao-ran-chun-xiao",
  "wang-chang-ling-fu-rong-lou",
  "liu-yu-xi-qiu-ci",
  "bai-ju-yi-wen-liu-shi-jiu",
  "wang-zhi-huan-deng-guan-que-lou",
  "li-bai-jing-ye-si",
  "wang-bo-song-du-shao-fu",
  "su-shi-ding-feng-bo",
  "wang-an-shi-mei-hua",
  "du-fu-chun-ye-xi-yu",
  "bai-ju-yi-mu-jiang-yin",
  "lin-bu-shan-yuan-xiao-mei",
  "yang-wan-li-xiao-chu-jing-ci-si",
  "he-zhi-zhang-yong-liu",
  "wang-wei-niao-ming-jian",
  "liu-chang-qing-feng-xue",
  "li-bai-zao-fa-bai-di-cheng",
  "li-qing-zhao-ru-meng-ling",
  "fan-zhong-yan-su-mu-zhe",
  "zhao-shi-xiu-yue-ke",
  ...EXPANDED_WORK_IDS,
] as const;

export const CONTENT_REVIEWS: Record<string, ContentReview> =
  Object.fromEntries(
    PUBLISHED_WORK_IDS.map((workId) => [
      workId,
      {
        workId,
        status: "published",
        reviewedAt: "2026-07-23",
        reviewedBy: "WeatherPoem 内容初审",
        sourceVerified: true,
        notes: "MVP 公版古典诗词种子内容；发布前仍建议按权威点校本复核。",
      } satisfies ContentReview,
    ]),
  );
