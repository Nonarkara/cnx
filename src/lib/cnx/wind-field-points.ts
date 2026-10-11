// The 25 Chiang Mai districts as sample points for the forecast outlook.
// Import-free so client and server share it.

import type { OutlookPlace } from "./wind-field-core";

/** District reference points (OSM admin centres, from gazetteer.json). */
export const CNX_DISTRICT_POINTS: OutlookPlace[] = [
  ["ไชยปราการ", "Chai Prakan", 19.69649, 99.17717],
  ["เชียงดาว", "Chiang Dao", 19.53578, 98.86581],
  ["จอมทอง", "Chom Thong", 18.37462, 98.60313],
  ["ดอยหล่อ", "Doi Lo", 18.52655, 98.74149],
  ["ดอยสะเก็ด", "Doi Saket", 18.93195, 99.22648],
  ["ดอยเต่า", "Doi Tao", 17.92904, 98.65048],
  ["ฝาง", "Fang", 19.90942, 99.19402],
  ["กัลยาณิวัฒนา", "Galyani Vadhana", 19.01498, 98.29316],
  ["หางดง", "Hang Dong", 18.72432, 98.88375],
  ["ฮอด", "Hot", 18.09404, 98.48469],
  ["สะเมิง", "Samoeng", 18.9015, 98.61438],
  ["สารภี", "Saraphi", 18.69124, 99.01729],
  ["แม่อาย", "Mae Ai", 19.96115, 99.34918],
  ["แม่แจ่ม", "Mae Chaem", 18.57394, 98.31687],
  ["แม่ออน", "Mae On", 18.72694, 99.29936],
  ["แม่ริม", "Mae Rim", 18.95397, 98.87428],
  ["แม่แตง", "Mae Taeng", 19.18952, 98.86149],
  ["แม่วาง", "Mae Wang", 18.67397, 98.67258],
  ["เมืองเชียงใหม่", "Mueang Chiang Mai", 18.7875, 98.95512],
  ["อมก๋อย", "Omkoi", 17.64514, 98.29345],
  ["พร้าว", "Phrao", 19.28844, 99.20991],
  ["เวียงแหง", "Wiang Haeng", 19.59063, 98.62914],
  ["สันกำแพง", "San Kamphaeng", 18.73312, 99.15466],
  ["สันป่าตอง", "San Pa Tong", 18.60897, 98.88337],
  ["สันทราย", "San Sai", 18.94735, 99.03315],
].map(([nameTh, nameEn, lat, lon]) => ({ nameTh: nameTh as string, nameEn: nameEn as string, lat: lat as number, lon: lon as number }));
