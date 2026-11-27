import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown, ArrowUpRight, BadgeCheck, Bot, Download, FolderOpen, House, ImagePlus, Layers3,
  LogIn, MessagesSquare, Monitor, Palette, Presentation, Puzzle, Send, ShoppingBag, Sparkles,
} from "lucide-react";

import { SiteFooter, SiteHeader } from "@/app/projects/_components";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, serializeJsonLd } from "@/lib/seo";
import siteStyles from "@/app/projects/projects.module.css";
import styles from "./studio.module.css";

const repository = "https://github.com/cqai-club/ebao-studio";
const download = "/api/ebao-studio/download/";
const windowsDownload = { href: `${download}?platform=windows`, label: "Windows x64" };
const macDownloads = [
  { href: `${download}?platform=macos&arch=arm64`, label: "Mac Apple 芯片版" },
  { href: `${download}?platform=macos&arch=x64`, label: "Mac Intel 芯片版" },
];
const guide = `${repository}/blob/master/docs/development-release.md`;
const description = "e宝工坊是基于 DeepSeek Harness 的桌面 AI 工作台，支持 Windows 和 macOS，内置 e图宝、PPT Composer、多平台发布和插件市场。俱乐部现有账号可以直接登录。";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPageMetadata({
    title: "e宝工坊 AI 工作台下载 | 重庆AI创享俱乐部",
    description,
    path: "/ebao-studio/",
    image: "/images/ebao-studio/app-icon.webp",
  });
}

const bundledTools = [
  { icon: ImagePlus, title: "e图宝", description: "从工作台打开图片创作工具，生成和编辑图片。" },
  { icon: Presentation, title: "PPT Composer", description: "按用途浏览演示文稿模板，选好后在会话中填写制作需求。" },
  { icon: Send, title: "多平台发布", description: "连接平台账号，整理发布草稿，预览并确认后提交。" },
  { icon: MessagesSquare, title: "IM", description: "在 IM 设置中绑定支持的消息渠道，从聊天应用与 e宝对话。" },
  { icon: ShoppingBag, title: "插件市场", description: "浏览 CQAI 插件目录，从桌面工作台安装所需插件。" },
  { icon: Puzzle, title: "Skills / MCP", description: "查看与管理技能，配置需要连接的 MCP 服务。" },
  { icon: House, title: "e宝首页", description: "在首页开始新会话，选择工作区和模型。" },
  { icon: Palette, title: "CQAI Club 主题", description: "在外观设置中选择俱乐部主题。" },
];

const digitalEmployees = [
  { name: "e图宝", description: "生成和编辑图片，在画布上整理创作素材。", artwork: "imagegen.webp", status: "内置可用" },
  { name: "多平台发布", description: "整理内容草稿，预览并提交到所选平台。", artwork: "publisher.webp", status: "内置可用" },
  { name: "e剪宝", description: "面向数字人、短视频和口播的视频制作工作区。", artwork: "video.webp", status: "插件安装" },
  { name: "e文宝", description: "协助起草文章、整理文案和工作笔记。", artwork: "employee-writing.webp", status: "插件安装" },
  { name: "e客宝", description: "协助整理客户咨询、服务问题和答复。", artwork: "employee-customer.webp", status: "插件安装" },
  { name: "e销宝", description: "协助准备营销内容、梳理线索和销售话术。", artwork: "employee-sales.webp", status: "插件安装" },
  { name: "e研宝", description: "面向文献梳理、论文写作和研究流程。", artwork: "employee-research.webp", status: "插件安装" },
  { name: "知识库", description: "归集项目资料，按问题检索相关内容。", artwork: "employee-knowledge.webp", status: "插件安装" },
  { name: "创作白板", description: "在白板上组织灵感、画面和协作素材。", artwork: "employee-whiteboard.webp", status: "暂未开放" },
  { name: "e恋爱宝", description: "为日常对话和关系沟通提供表达灵感。", artwork: "employee-relationship.webp", status: "暂未开放" },
  { name: "e家宝", description: "面向家庭智能设备的状态查看和管理。", artwork: "employee-home.webp", status: "暂未开放" },
] as const;

const features = [
  { icon: Bot, title: "交代任务", description: "告诉 e宝你想做什么，围绕当前任务与私人助理沟通，把需求说清楚。" },
  { icon: Layers3, title: "选择模型", description: "登录后从工作台选择模型，也可以在模型设置中管理自己的 API Key。" },
  { icon: FolderOpen, title: "围绕项目工作", description: "带上自己的文件与素材，在工作区中处理任务，接着已有的工作往下做。" },
  { icon: Puzzle, title: "管理插件", description: "在桌面插件管理器查看和安装所需的插件。" },
];

function DownloadLinks({ href, label, buttonClass }: { href: string; label: string; buttonClass: string }) {
  return (
    <div>
      <a className={buttonClass} href={href} target="_blank" rel="noopener noreferrer">下载 {label}<ArrowUpRight size={18} aria-hidden="true" /></a>
      <small>手动选择 <a href={`${href}&source=gitcode`} target="_blank" rel="noopener noreferrer" aria-label={`从 GitCode 下载 ${label}`}>GitCode</a> · <a href={`${href}&source=github`} target="_blank" rel="noopener noreferrer" aria-label={`从 GitHub 下载 ${label}`}>GitHub</a></small>
    </div>
  );
}

export default function EbaoStudioPage() {
  return (
    <div className={`${siteStyles.siteShell} ${styles.page}`}>
      <a className={siteStyles.skipLink} href="#studio-main">跳到主要内容</a>
      <SiteHeader current="ebao" />
      <main id="studio-main">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([
          breadcrumbJsonLd([{ name: "俱乐部首页", path: "/" }, { name: "e宝工坊", path: "/ebao-studio/" }]),
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "e宝工坊",
            alternateName: "EBAO STUDIO",
            description,
            url: absoluteUrl("/ebao-studio/"),
            image: absoluteUrl("/images/ebao-studio/app-icon.webp"),
            operatingSystem: ["Windows", "macOS"],
            applicationCategory: "ProductivityApplication",
            downloadUrl: [windowsDownload, ...macDownloads].map(({ href }) => absoluteUrl(href)),
            sameAs: repository,
            inLanguage: "zh-CN",
          },
        ]) }} />
        <section className={styles.hero} aria-labelledby="studio-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.statusDot} />能帮你干活的私人助理</p>
              <div className={styles.productName}>
                <Image src="/images/ebao-studio/app-icon.webp" alt="" width={48} height={48} unoptimized />
                <span>e宝工坊 <small>EBAO STUDIO</small></span>
              </div>
              <h1 id="studio-title">你的桌面<br /><span>AI 工作台。</span></h1>
              <p className={styles.lead}>和 e宝讨论任务，在工作区里整理文件、素材和会话。</p>
              <div className={styles.actions}>
                <a className={styles.primaryButton} href="#download"><Download size={18} aria-hidden="true" />下载 e宝工坊</a>
                <Link className={styles.secondaryButton} href="/member"><LogIn size={18} aria-hidden="true" />会员中心</Link>
              </div>
              <p className={styles.memberHint}><BadgeCheck size={18} aria-hidden="true" />使用 e宝工坊账号登录</p>
              <p className={styles.heroNote}><Monitor size={15} aria-hidden="true" />Windows · macOS<span>开源桌面应用</span></p>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.orbit} aria-hidden="true" />
              <Image className={styles.robot} src="/images/ebao-studio/robot.webp" alt="E宝私人助理形象：举着星星的机器人" width={720} height={586} sizes="(max-width: 760px) 85vw, 520px" unoptimized loading="eager" />
              <p className={styles.visualCaption}>我是 E宝，你的私人助理。<span>需要帮忙的事，交给我来安排。</span></p>
            </div>
          </div>
          <div className={`${styles.container} ${styles.heroBottom}`}>
            <a href="#workspace">了解账号与工作区<ArrowDown size={16} aria-hidden="true" /></a>
            <a href="#digital-employees">查看数字员工<ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={`${styles.section} ${styles.container}`} id="workspace" aria-labelledby="workspace-title">
          <section className={styles.membership} id="membership" aria-labelledby="membership-title">
            <div className={styles.membershipCopy}>
              <p className={styles.kicker}>MEMBER LOGIN, READY TO WORK</p>
              <h2 id="membership-title">用 e宝工坊账号登录</h2>
              <p>安装后，在欢迎页选择 e宝工坊账号。已有 <Link href="/">重庆 AI 创享俱乐部</Link> 账号可以直接使用，登录后可在工作台选择模型。</p>
            </div>
            <Link className={styles.secondaryButton} href="/member"><LogIn size={18} aria-hidden="true" />前往会员中心</Link>
          </section>
          <div className={styles.sectionHeading}>
            <h2 id="workspace-title">e宝工坊工作区</h2>
            <p>从首页开始会话、选择模型和工作区，常用工具可以从工作台直接打开。</p>
          </div>
          <figure className={styles.screenshot}>
            <Image src="/images/ebao-studio/workspace-v0.0.19.webp" alt="e宝工坊工作区，左侧是工具和工作区入口，右侧是新会话输入区" width={1920} height={1230} sizes="(max-width: 1120px) 94vw, 1120px" unoptimized />
            <figcaption>e宝工坊桌面工作区 · macOS</figcaption>
          </figure>
        </section>

        <section className={`${styles.section} ${styles.container} ${styles.employeesSection}`} id="digital-employees" aria-labelledby="digital-employees-title">
          <div className={styles.sectionHeading}>
            <h2 id="digital-employees-title">数字员工</h2>
            <p>在 e宝工坊工作台打开内置工具，也可以在插件管理器安装所需插件。</p>
          </div>
          <div className={styles.employeeGrid}>
            {digitalEmployees.map(employee => (
              <article key={employee.name} className={styles.employeeCard}>
                <div className={styles.employeeArtwork}>
                  <Image src={`/images/ebao-studio/${employee.artwork}`} alt="" width={800} height={450} sizes="(max-width: 520px) 92vw, (max-width: 760px) 46vw, (max-width: 1000px) 30vw, 268px" unoptimized />
                </div>
                <div className={styles.employeeBody}>
                  <div className={styles.employeeHeading}>
                    <h3>{employee.name}</h3>
                    <span className={styles.employeeStatus} data-bundled={employee.status === "内置可用" ? "" : undefined}>{employee.status}</span>
                  </div>
                  <p>{employee.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.toolsSection}`} id="tools" aria-labelledby="tools-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <h2 id="tools-title">内置工具与插件</h2>
              <p>安装后即可从工作台或设置中打开。联网能力按需使用账号或连接服务。</p>
            </div>
            <div className={styles.toolGrid} id="extensions">
              {bundledTools.map(tool => (
                <article key={tool.title} className={styles.toolCard}>
                  <tool.icon size={22} aria-hidden="true" />
                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.presentationSection} ${styles.container}`} aria-labelledby="presentation-title">
          <div className={styles.presentationCopy}>
            <h2 id="presentation-title">为演示文稿选个模板</h2>
            <p>从会话打开 PPT Composer，按商务、推广、咨询、学术等用途筛选模板。选好后，直接在输入框描述演示内容。</p>
          </div>
          <figure className={styles.screenshot}>
            <Image src="/images/ebao-studio/ppt-templates-v0.0.19.webp" alt="PPT Composer 的分类栏、模板预览和会话输入区" width={1448} height={1038} sizes="(max-width: 760px) 94vw, 680px" unoptimized />
            <figcaption>PPT Composer 模板选择器</figcaption>
          </figure>
        </section>

        <section className={`${styles.section} ${styles.foundation}`} aria-labelledby="foundation-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>BUILT AROUND YOUR WORK</p>
              <h2 id="foundation-title">在桌面工作区处理任务</h2>
            </div>
            <div className={styles.featureGrid}>
              {features.map(feature => (
                <article key={feature.title} className={styles.feature}>
                  <feature.icon size={24} aria-hidden="true" />
                  <h3>{feature.title}</h3><p>{feature.description}</p>
                </article>
              ))}
            </div>
            <p className={styles.privacyNote}>工作区、会话和配置默认保存在本机。使用云端模型或联网工具时，应用会连接相应服务。</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.container}`} id="download" aria-labelledby="download-title">
          <div className={styles.downloadHeading}>
            <div><p className={styles.kicker}>READY WHEN YOU ARE</p><h2 id="download-title">下载 e宝工坊</h2><p>选择适合你电脑的安装包。安装后，使用 e宝工坊账号登录，俱乐部现有账号可以直接使用。</p></div>
            <Sparkles size={38} aria-hidden="true" />
          </div>
          <div className={styles.downloadGrid}>
            <article className={styles.downloadCard}>
              <Monitor size={28} aria-hidden="true" /><h3>Windows</h3><p>x64 安装包</p>
              <DownloadLinks {...windowsDownload} buttonClass={styles.primaryButton} />
            </article>
            <article className={styles.downloadCard}>
              <Monitor size={28} aria-hidden="true" /><h3>macOS</h3><p>在「关于本机」查看芯片或处理器。</p>
              <div className={styles.downloadOptions}>
                {macDownloads.map(target => <DownloadLinks key={target.href} {...target} buttonClass={styles.secondaryButton} />)}
              </div>
            </article>
          </div>
          <div className={styles.releaseNote}>
            <strong>测试预发布安装说明</strong>
            <p>安装包为未签名的测试预发布，请下载后手动安装。</p>
            <p>中国大陆默认从 GitCode 下载，其他地区默认从 GitHub 下载。也可以手动选择下载源。</p>
          </div>
          <div className={styles.resourceLinks}>
            <a href={guide} target="_blank" rel="noopener noreferrer">阅读开发与安装说明<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer">反馈与交流<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={repository} target="_blank" rel="noopener noreferrer">查看项目源码<ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={`${styles.container} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title">开始之前，你可能还想了解</h2>
          <details><summary>内置工具在哪里打开？</summary><p>从侧栏打开 e图宝或多平台发布，在新会话中可选择 PPT 模板。IM、Skills / MCP 和主题可在设置中查看，更多插件可以从插件市场安装。</p></details>
          <details><summary>登录后如何选择模型？</summary><p>在工作台打开模型设置，选择 e宝工坊账号提供的模型。若你使用自己的 DeepSeek API Key，可在模型设置中单独配置。</p></details>
          <details><summary>使用哪个账号登录？</summary><p>在欢迎页选择 e宝工坊账号。已有的重庆 AI 创享俱乐部账号可以直接使用，账号相关事项可前往 <Link href="/member">会员中心</Link> 查看。</p></details>
          <details><summary>可以扩展更多功能吗？</summary><p>可以。e宝工坊支持通过插件扩展能力，也支持用 Profile 管理不同工作配置。插件安装、启用和开发方式请查看项目文档。</p></details>
          <details><summary>这是 DeepSeek 官方软件吗？</summary><p>e宝工坊基于 DeepSeek Harness，由社区独立维护，与深度求索及上游官方团队没有隶属或背书关系。</p></details>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
