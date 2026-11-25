import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown, ArrowUpRight, BadgeCheck, BookOpen, Bot, Check, Download, FileText, FolderOpen,
  GraduationCap, Heart, House, ImagePlus, Layers3, LogIn, MessagesSquare, Monitor, Presentation, Puzzle, Send, Sparkles, Video,
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
const employeeArtworkVersion = "20261014";
const description = "e宝工坊是基于 DeepSeek Harness 的桌面 AI 工作台，支持 Windows 和 macOS。使用 e宝工坊账号登录，重庆 AI 创享俱乐部现有账号可以直接使用。";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return createPageMetadata({
    title: "e宝工坊 AI 工作台下载 | 重庆AI创享俱乐部",
    description,
    path: "/ebao-studio/",
    image: "/images/ebao-studio/app-icon.webp",
  });
}

const historicalPlugins = [
  { icon: ImagePlus, name: "e图宝", label: "帮你生成和编辑图片", description: "图片生成与编辑、提示词模板、无限画布，把零散灵感整理成可继续创作的图像。", image: "imagegen.webp", className: "imageTool" },
  { icon: Video, name: "e剪宝", label: "帮你制作视频", description: "在统一视频工作区中，选择数字人、短视频或口播制作流程，组织素材、文案和制作设置。", image: "video.webp", className: "videoTool" },
  { icon: Send, name: "多平台发布", label: "帮你整理和发布内容", description: "管理平台账号，整理文章、图文与视频草稿，预览内容，确认后提交到所选账号。", image: "publisher.webp", className: "publishTool" },
  { icon: MessagesSquare, name: "e销宝", label: "帮你准备销售沟通", description: "结合客户原话和产品知识，辅助准备销售话术、应对异议，并复盘沟通过程。", image: "employee-sales.webp", className: "purpleTool" },
  { icon: GraduationCap, name: "e研宝", label: "帮你推进学术研究", description: "提供文献研究、论文写作、同行评审与研究流程四套学术技能，辅助推进研究任务。", image: "employee-research.webp", className: "blueTool" },
  { icon: BookOpen, name: "知识库", label: "帮你整理和检索知识", description: "导入资料、整理知识，通过带来源引用的问答找到依据，也让 e宝按需检索项目资料。", image: "employee-knowledge.webp", className: "blueTool" },
] as const;

const employeeGroups = [
  {
    id: "upcoming", icon: Puzzle, title: "正在建设的数字员工", status: "建设中",
    description: "写作、客户服务、白板共创、关系沟通与家庭智能设备管理，是团队接下来探索的工作方向。",
    employees: [
      { icon: FileText, name: "e文宝", label: "帮你写作和整理内容", description: "把零散想法整理成清晰的文字，辅助文章、文案与日常内容创作。", image: "employee-writing.webp", className: "goldTool" },
      { icon: MessagesSquare, name: "e客宝", label: "帮你处理客户沟通", description: "围绕客户咨询与服务沟通，帮助梳理问题、组织表达，推进沟通。", image: "employee-customer.webp", className: "blueTool" },
      { icon: Presentation, name: "创作白板", label: "帮你共创想法与画面", description: "在同一块白板上梳理灵感、组织想法和画面，让共创过程更直观。", image: "employee-whiteboard.webp", className: "purpleTool" },
      { icon: Heart, name: "e恋爱宝", label: "帮你寻找沟通灵感", description: "围绕日常对话与关系表达，提供沟通灵感，帮助把想法说清楚。", image: "employee-relationship.webp", className: "goldTool" },
      { icon: House, name: "e家宝", label: "帮你管理家庭智能设备", description: "围绕灯光、空调和传感器，整理设备状态与控制入口，辅助管理家庭里的智能设备。", image: "employee-home.webp", className: "blueTool" },
    ],
  },
] as const;

const features = [
  { icon: Bot, title: "交代任务", description: "告诉 e宝你想做什么，围绕当前任务与私人助理沟通，把需求说清楚。" },
  { icon: Layers3, title: "选择模型", description: "登录后从工作台选择模型，也可以在模型设置中管理自己的 API Key。" },
  { icon: FolderOpen, title: "围绕项目工作", description: "带上自己的文件与素材，在工作区中处理任务，接着已有的工作往下做。" },
  { icon: Puzzle, title: "管理插件", description: "在桌面插件管理器查看和安装所需的官方 Harness 插件。" },
];

function EmployeeCard({ employee, status, headingLevel = 3 }: {
  employee: (typeof historicalPlugins)[number] | (typeof employeeGroups)[number]["employees"][number];
  status: "历史插件" | "建设中";
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const imageSource = `/images/ebao-studio/${employee.image}?v=${employeeArtworkVersion}`;

  return (
    <article className={`${styles.toolCard} ${styles[employee.className]}`}>
      <div className={styles.toolArt}><Image src={imageSource} alt="" width={800} height={450} sizes="(max-width: 760px) 90vw, (max-width: 1000px) 46vw, 360px" unoptimized /></div>
      <div className={styles.toolBody}>
        <div className={styles.toolIdentity}>
          <p className={styles.toolName}><employee.icon size={19} aria-hidden="true" />{employee.name}</p>
          <span className={styles.employeeBadge}>{status}</span>
        </div>
        <Heading>{employee.label}</Heading>
        <p>{employee.description}</p>
      </div>
    </article>
  );
}

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
            <p className={styles.kicker}>MEET YOUR ASSISTANT</p>
            <h2 id="workspace-title">早期工作区界面</h2>
            <p>这张截图来自旧版。当前预览版采用 DeepSeek Harness 桌面工作区。</p>
          </div>
          <figure className={styles.screenshot}>
            <Image src="/images/ebao-studio/desktop-home.webp" alt="e宝工坊真实首页：对话输入区、E宝机器人，以及 e图宝、e剪宝和多平台发布数字员工入口" width={1632} height={988} sizes="(max-width: 1120px) 94vw, 1120px" unoptimized />
            <figcaption>e宝工坊首页 · macOS Beta v0.0.12-beta.1 界面示例</figcaption>
          </figure>
        </section>

        <section className={`${styles.section} ${styles.toolsSection}`} id="tools" aria-labelledby="tools-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>MEET YOUR DIGITAL TEAM</p>
              <h2 id="tools-title">历史插件与开发计划</h2>
              <p>以下图片、视频、发布和知识整理等插件来自旧版。当前预览版默认使用官方 Harness 插件，这些历史插件仍待重新接入。</p>
            </div>
            <div className={styles.toolGrid} id="extensions">
              {historicalPlugins.map(tool => <EmployeeCard key={tool.name} employee={tool} status="历史插件" />)}
            </div>
            {employeeGroups.map(group => (
              <section key={group.id} className={styles.employeeTeam} id={group.id} aria-labelledby={`${group.id}-title`}>
                <div className={styles.employeeHeading}>
                  <h3 id={`${group.id}-title`}><group.icon size={22} aria-hidden="true" />{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <div className={styles.toolGrid}>
                  {group.employees.map(employee => <EmployeeCard key={employee.name} employee={employee} status={group.status} headingLevel={4} />)}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.container} ${styles.videoSection}`} aria-labelledby="video-title">
          <div className={styles.videoCopy}>
            <p className={styles.kicker}>ONE TASK, THE RIGHT HELPER</p>
            <h2 id="video-title">旧版 e剪宝的工作区</h2>
            <p>旧版 e剪宝提供过独立的视频制作工作区。下图是口播制作表单，可导入素材、填写文案和调整制作设置。</p>
            <ul className={styles.checkList}>
              <li><Check size={18} aria-hidden="true" />数字人、短视频、口播制作入口</li>
              <li><Check size={18} aria-hidden="true" />围绕素材和文案组织工作</li>
              <li><Check size={18} aria-hidden="true" />按制作流程调整对应设置</li>
            </ul>
          </div>
          <figure className={styles.screenshot}>
            <Image src="/images/ebao-studio/video-workbench.webp" alt="e剪宝真实口播视频制作表单，可选择视频素材、填写文案，并调整制作设置" width={1632} height={988} sizes="(max-width: 900px) 94vw, 690px" unoptimized />
            <figcaption>e剪宝口播制作 · macOS Beta v0.0.12-beta.1 界面示例</figcaption>
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
          <div className={styles.releaseNote}><strong>测试预发布与安装说明</strong><p>请下载安装包手动安装。预览版使用独立的数据目录，安装包暂未签名。支持范围及系统提示请查看对应的发行说明。</p><p>中国大陆默认从 GitCode 下载，其他地区默认从 GitHub 下载。也可以手动选择下载源。</p><p>浏览安装说明和历史版本 <a href="https://gitcode.com/g-dxw/ebao-studio/releases" target="_blank" rel="noopener noreferrer">GitCode 发行版本</a> · <a href={`${repository}/releases`} target="_blank" rel="noopener noreferrer">GitHub 发行版本</a></p></div>
          <div className={styles.resourceLinks}>
            <a href={guide} target="_blank" rel="noopener noreferrer">阅读开发与安装说明<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer">反馈与交流<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={repository} target="_blank" rel="noopener noreferrer">查看项目源码<ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={`${styles.container} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title">开始之前，你可能还想了解</h2>
          <details><summary>e宝和数字员工是什么关系？</summary><p>e宝是和你沟通、帮你调度工作的私人助理；数字员工是负责具体任务的帮手，各有专长。你把需求告诉 e宝，由它调度合适的员工参与工作。</p></details>
          <details><summary>现在有哪些插件？</summary><p>当前预览版默认使用官方 Harness 插件，旧版的 e图宝、e剪宝和多平台发布等插件仍待重新接入。已安装的插件可在桌面工作区内查看和管理。</p></details>
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
