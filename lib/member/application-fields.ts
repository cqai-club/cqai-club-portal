/** Stored option values deliberately match the original application form. */
export const applicationOptions = {
  orgType: ["高校/科研院所", "国有企业", "民营企业", "外企", "政府/事业单位", "自由职业/创业者", "在校学生", "其他"],
  provideRes: ["资金/投资", "AI技术/算法能力", "数据资源", "产业场景/业务需求", "政府/政策资源", "场地/活动支持", "媒体/品牌推广", "高校科研团队", "其他"],
  needRes: ["潜在客户", "技术合伙人/开发团队", "投资人/融资渠道", "行业专家/导师", "供应链/渠道资源", "高校/科研合作", "其他"],
  purpose: ["拓展人脉/寻找合作机会", "学习AI新技术/新应用", "寻找项目或投资机会", "寻找工作或兼职机会", "寻找技术合伙人/团队成员", "品牌曝光/企业宣传", "其他"],
  events: ["AI技术沙龙/讲座", "行业案例拆解", "项目路演/Demo Day", "黑客松/AI创新大赛", "企业参访/闭门交流会", "投融资对接会", "政策申报/产业扶持解读", "其他"],
  timePref: ["工作日晚上", "周六上午", "周六下午", "周六晚上", "周日上午", "周日下午", "周日晚上", "无所谓，看内容质量"],
  city: ["重庆主城", "重庆区县", "其他"],
  roleIntent: ["愿意担任志愿者", "愿意成为理事/合作单位", "暂时不考虑"],
  privacy: ["仅对会员可见", "完全公开", "暂不公开"],
} as const;

export interface MemberApplicationPayload {
  name: string;
  phone: string;
  wechat: string;
  email: string;
  organization: string;
  title: string;
  orgType: string;
  orgTypeOther: string;
  provideRes: string[];
  provideResOther: string;
  needRes: string[];
  needResOther: string;
  purpose: string;
  purposeOther: string;
  events: string[];
  eventsOther: string;
  timePref: string;
  city: string;
  cityOther: string;
  roleIntent: string;
  bio: string;
  privacy: string;
}

export interface MemberApplicationDTO extends MemberApplicationPayload {
  id: string;
  createdAt: string;
  reviewStatus: string;
  reviewNote: string;
  membershipState: string;
  membershipActive: boolean | null;
}
