import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown, ArrowUpRight, BadgeCheck, BookOpen, Bot, Check, Download, FileText, FolderOpen,
  GraduationCap, Heart, House, ImagePlus, Layers3, LogIn, MessagesSquare, Monitor, Presentation, Puzzle, Send, Sparkles, Video,
} from "lucide-react";

import { SiteFooter, SiteHeader } from "@/app/projects/_components";
import siteStyles from "@/app/projects/projects.module.css";
import styles from "./studio.module.css";

const repository = "https://github.com/cqai-club/ebao-studio";
const download = "/api/ebao-studio/download";
const guide = `${repository}/blob/master/docs/user-guide.md`;
const employeeArtworkVersion = "20261014";

export const metadata: Metadata = {
  title: "e宝工坊 · 能帮你干活的私人助理 | 重庆 AI 创享俱乐部",
  description: "e宝工坊是能帮你干活的私人助理，调度数字员工帮你处理任务。基于重庆AI创享俱乐部会员体系，内置适合的模型，无需配置复杂环境，会员账号登录即可使用。",
  openGraph: {
    title: "e宝工坊 · 能帮你干活的私人助理",
    description: "一个助理，一群帮手。内置适合的模型，使用重庆AI创享俱乐部会员账号登录，让数字员工帮你干活。",
    type: "website",
    locale: "zh_CN",
  },
};

const tools = [
  { icon: ImagePlus, name: "e图宝", label: "帮你生成和编辑图片", description: "图片生成与编辑、提示词模板、无限画布，把零散灵感整理成可继续创作的图像。", image: "imagegen.webp", className: "imageTool" },
  { icon: Video, name: "e剪宝", label: "帮你制作视频", description: "在统一视频工作区中，选择数字人、短视频或口播制作流程，组织素材、文案和制作设置。", image: "video.webp", className: "videoTool" },
  { icon: Send, name: "多平台发布", label: "帮你整理和发布内容", description: "管理平台账号，整理文章、图文与视频草稿，预览内容，确认后提交到所选账号。", image: "publisher.webp", className: "publishTool" },
] as const;

const pluginTools = [
  { icon: MessagesSquare, name: "e销宝", label: "帮你准备销售沟通", description: "结合客户原话和产品知识，辅助准备销售话术、应对异议，并复盘沟通过程。", image: "employee-sales.webp", className: "purpleTool" },
  { icon: GraduationCap, name: "e研宝", label: "帮你推进学术研究", description: "提供文献研究、论文写作、同行评审与研究流程四套学术技能，辅助推进研究任务。", image: "employee-research.webp", className: "blueTool" },
  { icon: BookOpen, name: "知识库", label: "帮你整理和检索知识", description: "导入资料、整理知识，通过带来源引用的问答找到依据，也让 e宝按需检索项目资料。", image: "employee-knowledge.webp", className: "blueTool" },
] as const;

// Follow desktop-presentation's roster: installed employees replace same-name planned cards.
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
  { icon: Layers3, title: "调度帮手", description: "让私人助理调度合适的数字员工，由各有专长的帮手参与具体工作。" },
  { icon: FolderOpen, title: "围绕项目工作", description: "带上自己的文件与素材，在工作区中处理任务，接着已有的工作往下做。" },
  { icon: Puzzle, title: "团队持续扩充", description: "更多数字员工正在开发中，团队的专长会逐步丰富，帮你处理更多工作场景。" },
];

function EmployeeCard({ employee, status, headingLevel = 3 }: {
  employee: (typeof tools)[number] | (typeof pluginTools)[number] | (typeof employeeGroups)[number]["employees"][number];
  status?: "插件可用" | "建设中";
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const imageSource = `/images/ebao-studio/${employee.image}${status ? `?v=${employeeArtworkVersion}` : ""}`;

  return (
    <article className={`${styles.toolCard} ${styles[employee.className]}`}>
      <div className={styles.toolArt}><Image src={imageSource} alt="" width={800} height={450} sizes="(max-width: 760px) 90vw, (max-width: 1000px) 46vw, 360px" unoptimized /></div>
      <div className={styles.toolBody}>
        <div className={styles.toolIdentity}>
          <p className={styles.toolName}><employee.icon size={19} aria-hidden="true" />{employee.name}</p>
          {status && <span className={`${styles.employeeBadge} ${status === "插件可用" ? styles.availableBadge : ""}`}>{status}</span>}
        </div>
        <Heading>{employee.label}</Heading>
        <p>{employee.description}</p>
      </div>
    </article>
  );
}

export default function EbaoStudioPage() {
  return (
    <div className={`${siteStyles.siteShell} ${styles.page}`}>
      <a className={siteStyles.skipLink} href="#studio-main">跳到主要内容</a>
      <SiteHeader current="ebao" />
      <main id="studio-main">
        <section className={styles.hero} aria-labelledby="studio-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.statusDot} />能帮你干活的私人助理</p>
              <div className={styles.productName}>
                <Image src="/images/ebao-studio/app-icon.webp" alt="" width={48} height={48} unoptimized />
                <span>e宝工坊 <small>EBAO STUDIO</small></span>
              </div>
              <h1 id="studio-title">一个助理，<br />一群<span>帮手。</span></h1>
              <p className={styles.lead}>告诉 e宝你要做什么。<br />它会调度不同专长的数字员工，<br className={styles.desktopBreak} />帮你处理任务，让工作一步步往前。</p>
              <div className={styles.actions}>
                <a className={styles.primaryButton} href="#download"><Download size={18} aria-hidden="true" />下载 e宝工坊</a>
                <Link className={styles.secondaryButton} href="/member"><LogIn size={18} aria-hidden="true" />会员中心</Link>
              </div>
              <p className={styles.memberHint}><BadgeCheck size={18} aria-hidden="true" />内置模型，会员账号登录即可使用</p>
              <p className={styles.heroNote}><Monitor size={15} aria-hidden="true" />Windows · macOS<span>开源桌面应用</span></p>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.orbit} aria-hidden="true" />
              <span className={`${styles.floatingLabel} ${styles.labelImage}`}><ImagePlus size={18} aria-hidden="true" />图片员工</span>
              <Image className={styles.robot} src="/images/ebao-studio/robot.webp" alt="E宝私人助理形象：举着星星的机器人" width={720} height={586} sizes="(max-width: 760px) 85vw, 520px" unoptimized loading="eager" />
              <span className={`${styles.floatingLabel} ${styles.labelVideo}`}><Video size={18} aria-hidden="true" />视频员工</span>
              <span className={`${styles.floatingLabel} ${styles.labelPublish}`}><Send size={18} aria-hidden="true" />发布员工</span>
              <p className={styles.visualCaption}>我是 E宝，你的私人助理。<span>需要帮忙的事，交给我来安排。</span></p>
            </div>
          </div>
          <div className={`${styles.container} ${styles.heroBottom}`}>
            <span>一位私人助理，一支数字员工团队</span>
            <a href="#workspace">看看如何帮你干活<ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={`${styles.section} ${styles.container}`} id="workspace" aria-labelledby="workspace-title">
          <section className={styles.membership} id="membership" aria-labelledby="membership-title">
            <div className={styles.membershipCopy}>
              <p className={styles.kicker}>MEMBER LOGIN, READY TO WORK</p>
              <h2 id="membership-title">内置模型，会员登录即用。</h2>
              <p>e宝工坊基于 <Link href="/">重庆AI创享俱乐部</Link> 的会员体系，已内置适合工作场景的模型，无需配置复杂环境。</p>
              <p>下载并安装后，在 e宝工坊中使用俱乐部会员账号登录，就可以让私人助理和数字员工开始帮你干活。</p>
            </div>
            <Link className={styles.secondaryButton} href="/member"><LogIn size={18} aria-hidden="true" />前往会员中心</Link>
          </section>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>MEET YOUR ASSISTANT</p>
            <h2 id="workspace-title">你交代任务，e宝调度帮手。</h2>
            <p>e宝是和你沟通的私人助理，数字员工是负责具体工作的帮手。说出需求，让不同专长的员工参与到你的任务中。</p>
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
              <h2 id="tools-title">先认识几位数字员工。</h2>
              <p>从图片、视频和内容发布，到销售沟通、学术研究与知识整理，每位数字员工各有所长。更多工作方向也在建设中。</p>
            </div>
            <div className={styles.toolGrid} id="extensions">
              {tools.map(tool => <EmployeeCard key={tool.name} employee={tool} />)}
              {pluginTools.map(tool => <EmployeeCard key={tool.name} employee={tool} status="插件可用" />)}
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
            <p className={styles.sectionNote}>当前展示的是部分数字员工，实际可用功能以软件版本和已启用插件为准。</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.container} ${styles.videoSection}`} aria-labelledby="video-title">
          <div className={styles.videoCopy}>
            <p className={styles.kicker}>ONE TASK, THE RIGHT HELPER</p>
            <h2 id="video-title">比如视频任务，<br />就有专门的帮手。</h2>
            <p>e剪宝是团队里的视频制作员工。以已有口播素材为例：选择制作流程，放入素材，填写文案，再调整画面和制作设置，在专门的工作区里推进这项任务。</p>
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
              <h2 id="foundation-title">从交代任务，到找到帮手。</h2>
              <p>由私人助理和你沟通，再调度数字员工参与工作。不同的任务，可以有不同专长的帮手。</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map(feature => (
                <article key={feature.title} className={styles.feature}>
                  <feature.icon size={24} aria-hidden="true" />
                  <h3>{feature.title}</h3><p>{feature.description}</p>
                </article>
              ))}
            </div>
            <p className={styles.privacyNote}>工作区、会话和配置默认保存在本机；使用云端模型、联网工具或发布功能时，会连接相应服务。</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.container}`} id="download" aria-labelledby="download-title">
          <div className={styles.downloadHeading}>
            <div><p className={styles.kicker}>READY WHEN YOU ARE</p><h2 id="download-title">让私人助理和数字员工，来到你的桌面。</h2><p>选择适合你的系统，下载安装后，在软件中使用重庆AI创享俱乐部会员账号登录即可开始。</p></div>
            <Sparkles size={38} aria-hidden="true" />
          </div>
          <div className={styles.downloadGrid}>
            <article className={styles.downloadCard}>
              <Monitor size={28} aria-hidden="true" /><h3>Windows</h3><p>x64 安装包 · Portable ZIP</p>
              <a className={styles.primaryButton} href={`${download}?platform=windows`} target="_blank" rel="noopener noreferrer">下载 Windows 最新版<ArrowUpRight size={18} aria-hidden="true" /></a>
              <small>默认下载 x64 安装包。手动选择：<a href={`${download}?platform=windows&source=gitcode`} target="_blank" rel="noopener noreferrer">GitCode</a> · <a href={`${download}?platform=windows&source=github`} target="_blank" rel="noopener noreferrer">GitHub</a></small>
            </article>
            <article className={styles.downloadCard}>
              <Monitor size={28} aria-hidden="true" /><h3>macOS</h3><p>Universal · Intel 与 Apple Silicon</p>
              <a className={styles.secondaryButton} href={`${download}?platform=macos`} target="_blank" rel="noopener noreferrer">下载 macOS 最新版<ArrowUpRight size={18} aria-hidden="true" /></a>
              <small>默认下载 Universal DMG。手动选择：<a href={`${download}?platform=macos&source=gitcode`} target="_blank" rel="noopener noreferrer">GitCode</a> · <a href={`${download}?platform=macos&source=github`} target="_blank" rel="noopener noreferrer">GitHub</a></small>
            </article>
          </div>
          <div className={styles.releaseNote}><strong>当前提供测试预发布版本</strong><p>按访问 IP 自动选择下载源：中国大陆使用 GitCode，其他地区使用 GitHub；也可手动切换。安装包暂未签名。平台支持、安装提示与更新说明，请以对应 Release 为准；安装版自带核心运行环境。</p><p>便携版、ZIP 与历史版本：<a href="https://gitcode.com/g-dxw/ebao-studio/releases" target="_blank" rel="noopener noreferrer">GitCode 发行版本</a> · <a href={`${repository}/releases`} target="_blank" rel="noopener noreferrer">GitHub 发行版本</a></p></div>
          <div className={styles.resourceLinks}>
            <a href={guide} target="_blank" rel="noopener noreferrer">阅读使用指南<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer">反馈与交流<ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href={repository} target="_blank" rel="noopener noreferrer">查看项目源码<ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={`${styles.container} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title">开始之前，你可能还想了解</h2>
          <details><summary>e宝和数字员工是什么关系？</summary><p>e宝是和你沟通、帮你调度工作的私人助理；数字员工是负责具体任务的帮手，各有专长。你把需求告诉 e宝，由它调度合适的员工参与工作。</p></details>
          <details><summary>现在有哪些数字员工？</summary><p>本页展示了 e图宝、e剪宝和多平台发布，以及已提供插件的 e销宝、e研宝和知识库。e文宝、e客宝、创作白板、e恋爱宝和 e家宝正在建设中。插件需安装并启用后使用，实际可用的员工与功能以当前软件版本和已启用插件为准。</p></details>
          <details><summary>需要配置模型或复杂环境吗？</summary><p>不用。e宝工坊已内置适合工作场景的模型，无需先自行配置复杂环境。使用重庆AI创享俱乐部会员账号在软件中登录，即可开始使用。</p></details>
          <details><summary>使用哪个账号登录？</summary><p>使用重庆AI创享俱乐部会员账号。下载并安装 e宝工坊后，在软件中登录；账号相关事项可前往 <Link href="/member">会员中心</Link> 查看。</p></details>
          <details><summary>可以扩展更多功能吗？</summary><p>可以。e宝工坊支持通过插件扩展能力，也支持用 Profile 管理不同工作配置。插件安装、启用和开发方式请查看项目文档。</p></details>
          <details><summary>这是 DeepSeek 官方软件吗？</summary><p>e宝工坊基于 DeepSeek Harness，由社区独立维护，与深度求索及上游官方团队没有隶属或背书关系。</p></details>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
