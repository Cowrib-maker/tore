import type { Dictionary } from "@/i18n/types";
import { marketplaceZh } from "@/i18n/dictionaries/marketplace/zh";

/**
 * Professional ZH copy — aligned glossary:
 * 客户 · 律师 · 法律顾问 · 资质审核 · 法律咨询 · 咨询预约申请 ·
 * 咨询服务 · 律师名录 · 公开上架 · 费用
 */
export const zh: Dictionary = {
  meta: {
    title: "TORE — 法律服务市场 · 蒙古",
    description:
      "向蒙古经核验律师提交法律咨询申请。费用透明、资质审核、预约流程清晰。",
  },
  common: {
    brand: "TORE",
    signIn: "登录",
    signOut: "退出",
    getStarted: "开始使用",
    language: "语言",
  },
  nav: {
    lawyers: "查找律师",
    howItWorks: "服务流程",
    trust: "信任与安全",
    faq: "常见问题",
  },
  landing: {
    eyebrow: "法律服务市场 · 蒙古",
    headline: "对接经核验的法律顾问，清晰提出咨询申请。",
    support:
      "TORE 连接客户与蒙古持证律师 — 事先查看费用、比较经核验上架信息，并在线提交法律咨询申请。",
    ctaFind: "浏览律师名录",
    ctaJoin: "律师注册",
    proofProfiles: "资质已核验的上架",
    proofRating: "费用事先披露",
    proofBilingual: "MN · EN · ZH · KO",
    proofAvatars:
      "面向寻求法律顾问的客户，以及发布经核验咨询服务的律师。",
    featuredEyebrow: "档案示意",
    featuredTitle: "清晰档案。清晰费用。清晰下一步。",
    featuredSupport:
      "以下示意说明律师完成资质审核、进入名录并发布咨询服务后，客户所见信息。请打开公开律师名录查看当前上架。",
    browseAll: "打开律师名录",
    verified: "已核验",
    book: "查看",
    profile: "档案",
    nextSlot: "可预约时段",
    fromPrice: "起",
    howEyebrow: "服务流程",
    howTitle: "从注册到提交咨询申请。",
    howSteps: [
      {
        title: "创建账户",
        description:
          "以寻求法律意见的客户身份，或以准备发布咨询服务的律师身份注册。",
      },
      {
        title: "完成核验",
        description:
          "律师提交执业资质供审核。客户确认联系方式与电子邮箱。",
      },
      {
        title: "检索并申请",
        description:
          "浏览经核验名录中已公布费用与可预约时段的上架信息，随后提交咨询申请。",
      },
    ],
    trustEyebrow: "信任与安全",
    trustTitle: "以可问责的法律发现为设计目标。",
    trustSupport:
      "TORE 不发布匿名律师信息。资质审核、透明的咨询服务，以及经身份验证的咨询申请，构成市场基础。",
    trustItems: [
      {
        title: "资质审核",
        description:
          "公开上架须具备已批准的执业资质，以及至少一项有效的咨询服务。",
      },
      {
        title: "安全访问",
        description:
          "基于角色的工作台将客户与律师活动隔离，并要求身份验证。",
      },
      {
        title: "透明的咨询服务",
        description:
          "时长、以图格里克计价的费用，以及线上或当面形式，均在提交申请前可见。",
      },
      {
        title: "多语言设计",
        description:
          "注册时记录偏好语言，以服务蒙古多语言用户。",
      },
    ],
    testimonialsEyebrow: "TORE 服务对象",
    testimonialsTitle: "为蒙古专业法律工作而建。",
    testimonials: [
      {
        quote:
          "客户需要可靠途径识别持证法律顾问、了解费用，并在无需非正式往来的情况下申请时段。",
        name: "面向客户",
        role: "寻求法律意见的个人与机构",
      },
      {
        quote:
          "律师需要结构化渠道发布咨询服务、设定可预约时段，并以专业方式接受或拒绝申请。",
        name: "面向律师",
        role: "持证执业者与法律顾问",
      },
      {
        quote:
          "核验与清晰是市场基础。透明发现优先于更广泛的商业能力。",
        name: "运营原则",
        role: "先核验，后扩展",
      },
    ],
    faqEyebrow: "常见问题",
    faqTitle: "开始前的常见问题。",
    faqSupport:
      "创建账户以进入工作台。您可随时在公开律师名录中浏览经核验律师。",
    faqs: [
      {
        q: "谁可以在 TORE 上以律师身份公开上架？",
        a: "完成注册、接受市场条款、通过资质审核并发布有效咨询服务的持证执业者，可申请公开上架。",
      },
      {
        q: "咨询费用如何展示？",
        a: "律师发布载明时长与图格里克固定费用的咨询服务。提交咨询申请前即可看到该费用。",
      },
      {
        q: "TORE 支持哪些语言？",
        a: "界面提供蒙古语、英语、中文与韩语。偏好语言保存在您的账户中。",
      },
      {
        q: "今天可以提交咨询申请吗？",
        a: "可以。以客户身份登录后，打开经核验律师档案，选择咨询服务与可预约时段并提交申请。律师将接受或拒绝；您会收到应用内通知。",
      },
    ],
    ctaTitle: "选择合适的下一步。",
    ctaSupport:
      "客户浏览经核验律师并提交咨询申请。律师完成资质审核并发布咨询服务。一个面向蒙古、透明可及的法律服务市场。",
    ctaClient: "创建客户账户",
    ctaLawyer: "创建律师账户",
    footerTagline:
      "经核验的法律顾问、透明费用、清晰的咨询申请流程 — 服务蒙古。",
    footerProduct: "产品",
    footerAccounts: "账户",
    footerCompany: "机构",
    footerFeatured: "档案示意",
    footerHow: "服务流程",
    footerTrust: "信任与安全",
    footerClientReg: "客户注册",
    footerLawyerReg: "律师注册",
    footerFaq: "常见问题",
    footerTerms: "服务条款",
    footerPrivacy: "隐私政策",
    footerRights: "版权所有。",
    footerBuilt: "服务蒙古 · MN / EN / ZH / KO",
    lawyers: [
      {
        initials: "CC",
        name: "公司法律顾问",
        role: "示意 · 商事业务",
        focus: ["合同", "治理", "并购"],
        rating: "",
        reviews: 0,
        price: "180,000 ₮",
        duration: "60 分钟",
        city: "乌兰巴托",
        available: "每周排期",
        tone: "from-[#E4EFEB] to-[#C9DED6]",
      },
      {
        initials: "FC",
        name: "家事法律顾问",
        role: "示意 · 家事业务",
        focus: ["调解", "协议", "法律咨询"],
        rating: "",
        reviews: 0,
        price: "120,000 ₮",
        duration: "45 分钟",
        city: "乌兰巴托",
        available: "每周排期",
        tone: "from-[#E8ECEF] to-[#D2D9E0]",
      },
      {
        initials: "EC",
        name: "劳动法律顾问",
        role: "示意 · 劳动业务",
        focus: ["争议", "合规", "法律咨询"],
        rating: "",
        reviews: 0,
        price: "220,000 ₮",
        duration: "90 分钟",
        city: "区域覆盖",
        available: "每周排期",
        tone: "from-[#EEE8E1] to-[#DDD2C4]",
      },
    ],
    mockup: {
      urlBar: "tore.mn/lawyers · 经核验法律顾问",
      matching: "律师名录",
      matchingTitle: "仅显示经核验上架",
      availableCount: "筛选结果",
      bookTitle: "提交咨询申请",
      thisWeek: "本周",
      confirm: "提交申请 · 费用事先披露",
      verifiedTitle: "资质已审核",
      verifiedBody:
        "公开上架须具备已批准资质及有效咨询服务。",
      weekdays: ["一", "二", "三", "四", "五"],
      rows: [
        {
          initials: "CC",
          name: "公司法律顾问",
          focus: "合同 · 治理",
          rating: "",
          reviews: "",
          price: "180,000 ₮",
          tone: "bg-[#E4EFEB] text-[#0F3D33]",
        },
        {
          initials: "FC",
          name: "家事法律顾问",
          focus: "调解 · 协议",
          rating: "",
          reviews: "",
          price: "120,000 ₮",
          tone: "bg-[#E8ECF2] text-[#0A0F14]",
        },
        {
          initials: "EC",
          name: "劳动法律顾问",
          focus: "劳动 · 合规",
          rating: "",
          reviews: "",
          price: "220,000 ₮",
          tone: "bg-[#EEE8E1] text-[#0A0F14]",
        },
      ],
    },
  },
  auth: {
    loginTitle: "登录 TORE",
    loginDescription:
      "进入蒙古法律服务市场上的客户或律师工作台。",
    email: "电子邮箱",
    password: "密码",
    signingIn: "正在登录…",
    signInSubmit: "登录",
    forgotPassword: "忘记密码？",
    resendTitle: "重新发送验证邮件",
    resendDescription:
      "若电子邮箱尚未确认，请在下方输入地址以获取新的验证链接。",
    resendSubmit: "重新发送验证邮件",
    resendSending: "发送中…",
    verifyTitleSuccess: "电子邮箱已确认",
    verifyTitleError: "验证未成功",
    verifySuccess: "{email} 已完成验证。您可以登录。",
    verifyFailed:
      "此链接无效或已过期。请从登录页重新申请验证邮件。",
    verifyMissingToken: "打开本页需要有效的验证令牌。",
    verifyResendHint: "请返回登录页重新申请验证邮件。",
    newToTore: "首次使用 TORE？",
    registerClientLink: "注册为客户",
    registerLawyerLink: "注册为律师",
    clientTitle: "创建客户账户",
    clientDescription:
      "查找经核验律师、查看咨询费用并提交预约申请。",
    lawyerTitle: "创建律师账户",
    lawyerDescription:
      "完成资质审核、发布咨询服务并回应预约申请。",
    fullName: "法定全名",
    namePlaceholder: "与正式文件一致的姓名",
    emailPlaceholder: "name@example.com",
    passwordHint: "至少 8 个字符，须含一个大写字母和一个数字。",
    preferredLanguage: "偏好语言",
    acceptTerms:
      "我接受《服务条款》《隐私政策》及《市场免责声明》。",
    creating: "正在创建账户…",
    createClient: "创建客户账户",
    createLawyer: "创建律师账户",
    areYouLawyer: "您是律师吗？",
    registerAsLawyer: "注册为律师",
    areYouClient: "需要法律顾问吗？",
    registerAsClient: "注册为客户",
    alreadyHave: "已有账户？",
    forgotTitle: "密码找回",
    forgotDescription:
      "暂不提供自助密码重置。如需恢复访问，请使用注册电子邮箱联系支持团队。",
    sendReset: "联系支持",
    sending: "请稍候…",
    backToSignIn: "返回登录",
  },
  dashboard: {
    clientTitle: "客户工作台",
    lawyerTitle: "律师工作台",
    adminTitle: "管理后台",
    profileTitle: "档案",
    navDashboard: "概览",
    navProfile: "档案",
    navBookings: "咨询申请",
    navNotifications: "通知",
    navFindLawyers: "查找律师",
    navVerification: "资质核验",
    navOfferings: "咨询服务",
    navAvailability: "可预约时段",
    navLawyerReview: "资质审核",
    pageOfferings: "咨询服务",
    pageAvailability: "可预约时段",
    pageBookings: "咨询申请",
    pageNotifications: "通知",
    pageVerification: "资质核验",
    signOut: "退出",
  },
  marketplace: marketplaceZh,
};
