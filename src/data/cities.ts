import type { City } from "../types";

export const CITIES: City[] = [
  {
    id: "beijing",
    name: "北京",
    province: "北京",
    latitude: 39.9042,
    longitude: 116.4074,
    note: "华北，四季分明",
  },
  {
    id: "shanghai",
    name: "上海",
    province: "上海",
    latitude: 31.2304,
    longitude: 121.4737,
    note: "江南，湿润多雨",
  },
  {
    id: "hangzhou",
    name: "杭州",
    province: "浙江",
    latitude: 30.2741,
    longitude: 120.1551,
    note: "江南，湖山相映",
  },
  {
    id: "nanjing",
    name: "南京",
    province: "江苏",
    latitude: 32.0603,
    longitude: 118.7969,
    note: "江南，文脉深厚",
  },
  {
    id: "wuhan",
    name: "武汉",
    province: "湖北",
    latitude: 30.5928,
    longitude: 114.3055,
    note: "江汉交汇，夏季湿热",
  },
  {
    id: "guangzhou",
    name: "广州",
    province: "广东",
    latitude: 23.1291,
    longitude: 113.2644,
    note: "岭南，温暖多雨",
  },
  {
    id: "chengdu",
    name: "成都",
    province: "四川",
    latitude: 30.5728,
    longitude: 104.0668,
    note: "盆地，多云湿润",
  },
  {
    id: "xian",
    name: "西安",
    province: "陕西",
    latitude: 34.3416,
    longitude: 108.9398,
    note: "关中，古都气象",
  },
  {
    id: "changsha",
    name: "长沙",
    province: "湖南",
    latitude: 28.2282,
    longitude: 112.9388,
    note: "潇湘，雨热同期",
  },
  {
    id: "harbin",
    name: "哈尔滨",
    province: "黑龙江",
    latitude: 45.8038,
    longitude: 126.5349,
    note: "北国，冬季漫长",
  },
  {
    id: "kunming",
    name: "昆明",
    province: "云南",
    latitude: 25.0389,
    longitude: 102.7183,
    note: "高原，四季温和",
  },
  {
    id: "lanzhou",
    name: "兰州",
    province: "甘肃",
    latitude: 36.0611,
    longitude: 103.8343,
    note: "西北，干燥多风",
  },
];

export function findCity(cityId: string): City {
  return CITIES.find((city) => city.id === cityId) ?? CITIES[2]!;
}

