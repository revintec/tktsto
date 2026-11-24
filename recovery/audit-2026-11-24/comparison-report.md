# Chronological TKTSTO audit — 24 November 2026

**Finding: the cleanup retained the distinct page URLs available at 05:57, but it did not faithfully restore the original tree.** Nineteen saved entries had their URLs overwritten before 05:57. All nineteen participated in second-pass merges even though the paired records represented different URLs at 05:30. Forty-two surviving pages now have a different parent page/window from the original 05:30 tree.

This audit only read uploaded files and executed the recovery planners in an isolated JavaScript VM with no browser connection or write APIs. It did not change Chrome, TKTSTO, or any backup. Times below are Asia/Shanghai (+08:00).

## Chronology

| Backup | Tree entries | Tab records | Distinct full URLs | Extra exact-URL copies | Marked open | Pink saved entries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-11-16 02:47:44 | 894 | 872 | 872 | 0 | 240 | 36 |
| 2026-11-24 05:30:26 | 1251 | 1226 | 930 | 296 | 296 | 261 |
| 2026-11-24 05:57:12 | 1301 | 1275 | 930 | 345 | 296 | 311 |
| 2026-11-24 06:24:49 | 1303 | 1277 | 932 | 345 | 298 | 311 |
| 2026-11-24 07:25:40 | 952 | 930 | 930 | 0 | 295 | 37 |

Exact-URL copies count complete URLs, including all queries and fragments. The latest backup has zero such copies. TKTSTO’s looser badge still shows seven because the eight distinct Moka job pages differ only in their `#/job/...` fragments. All eight records survive.

**16 Nov → 24 Nov 05:30:** 26 old full URLs are no longer present: 19 belonged to removed entries, and seven changed on surviving IDs. Some are clear URL updates (for example, a meeting link becoming its end page, a Bilibili trailing slash, and newer dated work documents). The snapshots cannot establish whether the 19 deletions were intentional. These changes predate both of the latest cleanup scripts. There are 84 new full URLs.

**05:30 → 05:57:** 17 IDs disappeared and 67 appeared. One unique URL disappeared: `https://cloud.xn--4gq62f52gdss.asia/#/ticket`, titled “一元机场”, entry `1m3apfpt6--mac`. It remains absent in the latest backup. A Bilibili URL variant with an added slash appeared. Separately, 19 existing pink saved entries changed URLs; the old page URLs survived under other records.

**05:57 → 06:24:** two new URLs appeared: `chrome://extensions/` and Tab Ledger’s `settings.html#storage-cleanup`. There were no URL deletions or URL changes on existing IDs. Sixty-two child entries were promoted from the stale Tab Ledger viewer node to its window.

**06:24 → 07:25:** the two settings URLs disappeared. The prior 06:34 live diagnostic already lacked both IDs, so their removal preceded the latest cleanup execution. The stale Tab Ledger viewer was kept as a saved URL. All 930 full URLs present at 05:57 survive at 07:25. Of the 351 removed records, two were already absent in the live diagnostic; the planners account for the remaining 349 (267 first pass, 82 second pass).

## The 19 overwritten entries

All nineteen were unloaded, pink saved entries in both the 05:30 and 05:57 backups. Their modification timestamps fall between **05:53:02.648 and 05:53:10.315**, a span of approximately eight seconds. Seventeen already existed in the 16 November backup with the same URLs they still had at 05:30. The other two were created later. This clustered change strongly suggests a bulk reassignment rather than independent normal navigation, but these exports do not identify the responsible action or code path.

Twelve of the overwritten IDs survive in the final backup still representing the substituted URL; seven were removed in the second-pass merges. The full original and replacement URLs are recorded in `audit-details.json` under `overwrittenEntries`.

| Original entry ID | Page at 05:30 | Substituted page at 05:57 | Original direct children | ID survives at 07:25 |
| --- | --- | --- | ---: | --- |
| 1m7s4kryv--mac | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube | Docs | 12 | Yes |
| 1m7b1n530--mac | 最狂妄的公安局长，把女警当私人玩物，和情人光腚打扑克，被两个小毛贼看个精光！ - YouTube | okg-block.sg.larksuite.com/minutes/obsgyip53uxwekc53hq6x612 | 0 | No |
| 1m6xnjpb8--mac | 美女翻包藏有安全套？喜欢穿豹纹蕾丝，水多经常戴护垫！15厘米才是理想尺寸，小姐姐的回答太直接了！ - YouTube | 我去了世界最大的男女混浴温泉瀑布，泡起来到底多刺激？_哔哩哔哩_bilibili | 0 | No |
| 1m66gfgg5--mac | (3493) 5男1000女的荒诞监狱，每天被美女学生会折磨，却个个爽到不想走！大尺度漫改剧《监狱学园》 - YouTube | IT 审计控制与证据管理培训通知 2026-09-23 10:55 | 1 | No |
| 1m6bg6wwm--mac | Fault Alarm in Core Trade的视频会议 2026-10-31 07:52 | 【EN】Performance Feedback Conversation Sharing (Challenge Scenarios) 2026-10-29 08:59 | 0 | No |
| 1m7sqtm0w--mac | SRE Infra Squad晚例会 2026-11-19 18:57 | youtube.com/watch?v=A1uveVJYrpE | 0 | No |
| 1kyy40p62--mac | 07-31 \| AWS Migration 对齐 | 一口氣看懂哈利波特二創江湖！馬爾芙小姐如何爆紅網絡 \| 哈利專題 - YouTube | 0 | Yes |
| 1kzr908a4--mac | Atlas数据平台小分队的视频会议 | youtube.com/watch?v=4X3P-u-s60w | 0 | Yes |
| 1kzr90j43--mac | 08-11 \| Counter release post retro | The 2024 Model-Training Sabotage Incident: Victim Accounts and Evidence | 0 | Yes |
| 1m05c4ab1--mac | (3292) 看了这个视频，你就再也不会想看爱情动作片了❗ - YouTube | Docs | 0 | Yes |
| 1m6dzvrt1--mac | (3425) 红警林海密战!到处都是树木!黄瓜伐木利器! - YouTube | Docs | 0 | No |
| 1m6dzvw3d--mac | 韓國股市今年熔斷10次！共識為什麼說崩就崩？AI把九億人的共識壓成一個半人厚、一張原始文件就能掀翻、所有人同一秒翻船、建共識以天計崩以分鐘計、看跌期權埋在第二個峰吃做市商那一跳（上周会员节目放送） - YouTube | Sheet | 0 | No |
| 1m055twb8--mac | (3285) 盘点那些婚后才懂的那些事 - YouTube | 5男1000女的荒诞监狱，每天被美女学生会折磨，却个个爽到不想走！大尺度漫改剧《监狱学园》 - YouTube | 0 | Yes |
| 1m0f07ch1--mac | 违纪违法举报----中国科学院直属机关党委 | okg-block.sg.larksuite.com/minutes/obsgxmeq4e72xpw5691733ok | 0 | Yes |
| 1m0f27jxe--mac | 北京纳时微电子科技有限公司 - Google Search | Docs | 0 | Yes |
| 1m0f2w2td--mac | 无锡时微盛合科技创新合伙企业（有限合伙） - 爱企查 | Docs | 0 | Yes |
| 1kz5a5myt--mac | 宋文杰 Jason Song的视频会议 2026-08-03 23:29 | okg-block.sg.larksuite.com/minutes/obsgzr29h26r4cxv5t18vsgo | 1 | Yes |
| 1kztq8g4v--mac | 对下推送问题 2026-08-12 17:29 | Docs | 4 | Yes |
| 1m6gdkc40--mac | 2024年 - Lark Docs | okg-block.sg.larksuite.com/minutes/obsg1o17u2i79176jw6ud18y | 0 | Yes |

## Why exact-URL deduplication was insufficient

The second pass required full URL equality at repair time. That prevented it from merging different current page URLs, but it did not check historical identity. All 19 pairs below had different URLs in the 05:30 snapshot. A prior overwrite made them look like valid exact-URL duplicates. For the goal of restoring the original tree, treating those pairs as ordinary duplicate records was a flaw in the recovery plan.

**Concrete example:** `1m7s4kryv--mac` was “This Crazy Experiment Just Won A Nobel Prize” (`https://www.youtube.com/watch?v=kRpahwRFWZA`) with 12 children at 05:30. By 05:57 its URL had become the Lark document now titled “垃圾堆”, but it still had the same 12 children. The genuine document entry, `1m7yqfzrv--mac`, had two children of its own. The second pass kept the overwritten ID and merged the genuine document entry into it. The final document has 14 children, mixing those two original branches; the Nobel video survives separately as `1m854zhj7--mac` with no children.

**Another example:** `1kztq8g4v--mac` originally represented “对下推送问题 2026-08-12 17:29” with four children. Its URL changed to “SRE项目”. Those four children now sit beneath that document, while the original meeting survives as `1m854zvbf--mac` with no children.

| Retained ID | Its page at 05:30 | Removed ID | Its page at 05:30 |
| --- | --- | --- | --- |
| 1m7s4kryv--mac | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube | 1m7yqfzrv--mac | 垃圾堆 - Lark Docs |
| 1m27nkvw0--mac | Using AI Responsibly and Effectively 2026-09-11 13:00 | 1m7b1n530--mac | 最狂妄的公安局长，把女警当私人玩物，和情人光腚打扑克，被两个小毛贼看个精光！ - YouTube |
| 1m2m5mp5x--mac | 我去了世界最大的男女混浴温泉瀑布，泡起来到底多刺激？_哔哩哔哩_bilibili | 1m6xnjpb8--mac | 美女翻包藏有安全套？喜欢穿豹纹蕾丝，水多经常戴护垫！15厘米才是理想尺寸，小姐姐的回答太直接了！ - YouTube |
| 1m36h9chn--mac | IT 审计控制与证据管理培训通知 2026-09-23 10:55 | 1m66gfgg5--mac | (3493) 5男1000女的荒诞监狱，每天被美女学生会折磨，却个个爽到不想走！大尺度漫改剧《监狱学园》 - YouTube |
| 1m62s3h0f--mac | 【EN】Performance Feedback Conversation Sharing (Challenge Scenarios) 2026-10-29 08:59 | 1m6bg6wwm--mac | Fault Alarm in Core Trade的视频会议 2026-10-31 07:52 |
| 1m6z66peg--mac | 904期: 中国征信越来越像一块鸡肋｜食之无味，弃之可惜｜普通人小心翼翼维护的信用究竟换来了什么｜从白户困境到烂尾楼断供｜中国征信体系的现实尴尬｜当信用变成一种负担｜征信制度究竟出了什么问题 - YouTube | 1m7sqtm0w--mac | SRE Infra Squad晚例会 2026-11-19 18:57 |
| 1kyy40p62--mac | 07-31 \| AWS Migration 对齐 | 1m6xnjg2j--mac | 一口氣看懂哈利波特二創江湖！馬爾芙小姐如何爆紅網絡 \| 哈利專題 - YouTube |
| 1kzr90j43--mac | 08-11 \| Counter release post retro | 1m60zbb2s--mac | The 2024 Model-Training Sabotage Incident: Victim Accounts and Evidence |
| 1m05c4ab1--mac | (3292) 看了这个视频，你就再也不会想看爱情动作片了❗ - YouTube | 1m60nbcew--mac | 成本优化 - Lark Docs |
| 1m63gxeaq--mac | EC2/ECS成本分析 - Lark Docs | 1m6dzvrt1--mac | (3425) 红警林海密战!到处都是树木!黄瓜伐木利器! - YouTube |
| 1m63gxeam--mac | 网络费用情况 - Lark Docs | 1m6dzvw3d--mac | 韓國股市今年熔斷10次！共識為什麼說崩就崩？AI把九億人的共識壓成一個半人厚、一張原始文件就能掀翻、所有人同一秒翻船、建共識以天計崩以分鐘計、看跌期權埋在第二個峰吃做市商那一跳（上周会员节目放送） - YouTube |
| 1m0f2w2td--mac | 无锡时微盛合科技创新合伙企业（有限合伙） - 爱企查 | 1m6ghxe8d--mac | 10-31 OKX Global CC 攻击复盘 - Lark Docs |
| 1kz5a5myt--mac | 宋文杰 Jason Song的视频会议 2026-08-03 23:29 | 1m6j6jmzf--mac | 交易快照数据对接的视频会议 2026-11-03 10:21 |
| 1kzr908a4--mac | Atlas数据平台小分队的视频会议 | 1m854zm59--mac | 美女翻包藏有安全套？喜欢穿豹纹蕾丝，水多经常戴护垫！15厘米才是理想尺寸，小姐姐的回答太直接了！ - YouTube |
| 1m055twb8--mac | (3285) 盘点那些婚后才懂的那些事 - YouTube | 1m854zmv3--mac | (3493) 5男1000女的荒诞监狱，每天被美女学生会折磨，却个个爽到不想走！大尺度漫改剧《监狱学园》 - YouTube |
| 1m0f07ch1--mac | 违纪违法举报----中国科学院直属机关党委 | 1m854zn05--mac | Fault Alarm in Core Trade的视频会议 2026-10-31 07:52 |
| 1m0f27jxe--mac | 北京纳时微电子科技有限公司 - Google Search | 1m854zn2j--mac | 业务需求调研 2026-10 - Lark Docs |
| 1kztq8g4v--mac | 对下推送问题 2026-08-12 17:29 | 1m854zndm--mac | SRE项目 - Lark Docs |
| 1m6gdkc40--mac | 2024年 - Lark Docs | 1m854znnz--mac | SRE Infra Squad晚例会 2026-11-04 18:16 |

## Parent relationships that differ from the original tree

The baseline is the **original tree inside the 05:30 backup**, with only the four known temporary restored windows and their descendants excluded. It contains 951 records and 930 distinct tab URLs. Comparing parents by page URL (or by stable ID for window/note parents) avoids falsely counting normal ID replacement as a structural difference.

**42 surviving pages have a different parent page/window.** This is a structural difference count, not a count of missing URLs or closed browser tabs. The backups alone cannot determine whether every intervening move was intentional. It also does not quantify sibling-order differences.

| Category | Pages |
| --- | ---: |
| Children beneath a parent whose URL was overwritten | 18 |
| Work page placed in the research branch | 3 |
| Saved reconstruction placed under a YouTube page | 12 |
| Children promoted after original parent deletion | 6 |
| Research link left in the separate saved window | 3 |

The 18 children in the first category retained parent identities whose URLs had been overwritten (including one subsequently merged parent). Six had already been promoted after their original parent entries disappeared by 05:57. The second pass selected saved reconstruction positions for 12 other pages under a YouTube node; these do not match their 05:30 placement. Three work pages occupy overwritten research entries, and three original research URLs remain in the separate saved window `1m856bqzh--mac`.

| Page / original entry | Parent at 05:30 | Parent at 07:25 |
| --- | --- | --- |
| java situation is insane - YouTube (`1m7ytc8k5--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| OpenAI is Cooked - YouTube (`1m7ytccr3--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 五次发布撞车，死磕两年，DeepSeek 与 Kimi，谁才是中国 AI 最后的赢家？ - YouTube (`1m7ytcjqg--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 電子遊戲巔峰之作！GTA6真的好玩嗎？不同設備差異居然這麼大？！🎮｜大狸子切切裡 - YouTube (`1m7ytcnxs--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 外卖员深夜接单，遇见一个女人躺在地上，竟然是饿的；齐奥塞斯库最大的罪行，为什么是破坏罗马尼亚经济罪 - YouTube (`1m7ytcv3y--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 700億撐不過5天！華發被惠譽砍成垃圾級、AAA債收益率飆上200%、400億只對得上145億！理財贖基金兩週砸債5100億、4萬多隻理財回撤、這叫金融癲癇！你惦記利息他惦記本金！ - YouTube (`1m7ytcwxq--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 红警不一样的地图!开局差点懵逼了! - YouTube (`1m7ytd72t--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 红警敌人玩线圈防守!那么用魔法对魔法! - YouTube (`1m7yk01hx--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| (3517) 【精品沙雕動畫】我獲得時間禁止能力，開局我就去打桌球！#沙雕劇情 #funny #動漫 - YouTube (`1m7t89grm--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| (3523) 红警光着身子到处跑!最后说我作弊开透视! - YouTube (`1m7x1dpfy--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| 没有人比清月更懂反华（美国为什么反华） - YouTube (`1m7sf7h4j--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| America's Atomic Bomb Reactor Started Dying. Nobody Knew Why. - YouTube (`1m7sf7r7e--mac`) | (3523) This Crazy Experiment Just Won A Nobel Prize - YouTube (`1m7s4kryv--mac`) | 垃圾堆 - Lark Docs (`1m7s4kryv--mac`) |
| (3461) 上線3天播放量破2.1億！國產懸疑最敢拍《微暗之火》撕開小鎮遮羞布 - YouTube (`1m6vjdgk7--mac`) | (3493) 5男1000女的荒诞监狱，每天被美女学生会折磨，却个个爽到不想走！大尺度漫改剧《监狱学园》 - YouTube (`1m66gfgg5--mac`) | IT 审计控制与证据管理培训通知 2026-09-23 10:55 (`1m36h9chn--mac`) |
| Fault Alarm in Core Trade的视频会议 2026-10-31 07:52 (`1m6bg6wwm--mac`) | 工作 (`1kvwryyv4-01-mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) |
| 业务需求调研 2026-10 - Lark Docs (`1m4tf3fsv--mac`) | 工作 (`1kvwryyv4-01-mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) |
| 10-31 OKX Global CC 攻击复盘 - Lark Docs (`1m6ghxe8d--mac`) | 工作 (`1kvwryyv4-01-mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) |
| (3509) 爆火韓劇！首播收視Top1，丈夫白天上班、晚上執行暗殺任務，卻不知道妻子的身份更加恐怖 - YouTube (`1m7nga7m5--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| Samsung Galaxy Z TriFold 2 – Samsung’s Biggest Improvements Revealed?! 🤯 - YouTube (`1m7j926a3--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 沙舞遇见咯咯哒，美女排排坐任君选择！黑灯舞太刺激了，最后一位美女身材和颜值让我沦陷！ - YouTube (`1m7knvw79--mac`) | Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| Why Microsoft couldn’t fix its own servers for 36 hours... - YouTube (`1m7knz2z7--mac`) | Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| DeepSeek等四家用英伟达禁运卡训练，实锤在哪？ #英伟达禁运卡 - YouTube (`1m7knz8fd--mac`) | Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| 腾讯自由现金流负691亿，追赶AI为何还卡在微信？ #腾讯AI - YouTube (`1m7vc0s4j--mac`) | Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| [MULTI SUB]修仙动画【老六转移大法，遇事不决就自爆】大哥你快砍我！不然我怎么晋升？#沙雕轻漫#SDQM - YouTube (`1m7vc1vmt--mac`) | Why Japan's Top Fantasy Is Your Wife Finally Cheating - YouTube (`1m7jbjhrv--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| 阿里云故障复盘 2026-11-05 14:30 (`1m6nkf6y1--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 香港 183天 - Google Search (`1m77sppmj--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 泰国人妖表演偷拍全过程？严禁拍摄，但我们还是悄悄录下来了…_哔哩哔哩_bilibili (`1m77nqzfm--mac`) | 去了3次越南，被骗了7次，骗人的最高境界无解阳谋_哔哩哔哩_bilibili (`1m77mwq1d--mac`) | 工作 (`1kvwryyv4-01-mac`) |
| SRE Infra Squad晚例会 2026-11-18 18:18 (`1m7q4g5s1--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 腾讯内部讲话曝光：未来不一定要那么多管理岗位，所有人都要动手做事；每一个团队都要面向AI时代再创业，抛掉身上的包袱 (`1m7jsb9q7--mac`) | OKR (`1kx2xvck0--mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| SRE Infra Squad晚例会 2026-11-06 18:04 (`1m6rbrktv--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| (3461) 废物男主花4000租一日女友，竟一连租到3个校园女神，还都爱上了他？！后宫向漫改日剧《租借女友》 - YouTube (`1m6tt31qa--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| (3461) OpenAI新王牌 GPT 6.2-Bel 浮出水面！为什么跳过6.1？后台账单抓包偷跑，万名AI连战88小时干完人类4000年工作量！ - YouTube (`1m6y4d61s--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 英伟达被曝限中国客户49%：管不住中国公司，却管住自家新云 #英伟达限令 - YouTube (`1m6mxn3ey--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| ffmpeg concat different resolution - Google Search (`1m35am2kk--mac`) | 工作 (`1kvwryyv4-01-mac`) | (3543) 答小少妇的来信 - YouTube (`1m79amsqw--mac`) |
| 违纪违法举报----中国科学院直属机关党委 (`1m0f07ch1--mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) | Saved window 1m856bqzh--mac (`1m856bqzh--mac`) |
| 北京纳时微电子科技有限公司 - Google Search (`1m0f27jxe--mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) | Saved window 1m856bqzh--mac (`1m856bqzh--mac`) |
| 无锡时微盛合科技创新合伙企业（有限合伙） - 爱企查 (`1m0f2w2td--mac`) | 中科院举报材料 - Lark Docs (`1m0f0a1e9--mac`) | Saved window 1m856bqzh--mac (`1m856bqzh--mac`) |
| Campaign Middleware Alarms的视频会议 (`1kz5a6jdf--mac`) | 宋文杰 Jason Song的视频会议 2026-08-03 23:29 (`1kz5a5myt--mac`) | 交易快照数据对接的视频会议 2026-11-03 10:21 (`1kz5a5myt--mac`) |
| redpanda-data/redpanda: Redpanda is a streaming data platform for developers. Kafka API compatible. 10x faster. No ZooKeeper. No JVM! (`1m4eceknr--mac`) | 对下推送问题 2026-08-12 17:29 (`1kztq8g4v--mac`) | SRE项目 - Lark Docs (`1kztq8g4v--mac`) |
| k2-fsa/sherpa-onnx: Speech-to-text, text-to-speech, speaker diarization, speech enhancement, source separation, and VAD using next-gen Kaldi with onnxruntime without Internet connection. Support embedded systems, Android, iOS, HarmonyOS, Raspberry Pi, RISC-V, RK NPU, Axera NPU, Ascend NPU, x86_64 servers, websocket server/client, support 12 programming languages (`1m5fvbahc--mac`) | 对下推送问题 2026-08-12 17:29 (`1kztq8g4v--mac`) | SRE项目 - Lark Docs (`1kztq8g4v--mac`) |
| ggml-org/whisper.cpp: Port of OpenAI's Whisper model in C/C++ (`1m5gv250k--mac`) | 对下推送问题 2026-08-12 17:29 (`1kztq8g4v--mac`) | SRE项目 - Lark Docs (`1kztq8g4v--mac`) |
| Ryan Ye 叶暉翔的视频会议 2026-08-12 10:44 (`1kztq8x8a--mac`) | 对下推送问题 2026-08-12 17:29 (`1kztq8g4v--mac`) | SRE项目 - Lark Docs (`1kztq8g4v--mac`) |

## What was preserved and what cannot be established

- All 930 distinct full URLs from 05:57 remain in the latest backup.
- All 23 records carrying nonempty labels or notes survive with those values unchanged across the five backups. No nonempty label, note, checkbox or bookmark value was lost in this comparison.
- All eight distinct Moka job entries survive.
- All five serialized trees have consistent parent-child links, no duplicate/cyclic node references, and no unreachable nodes. This confirms graph integrity, not the correctness of their historical organization.
- Replaying the actual first- and second-pass planning functions against the 06:34 live diagnostic reproduces the latest backup’s node IDs, full URLs, parent-child links and child order, labels/notes, creation times, and loaded/pink flags exactly (after normalizing fields omitted by ordinary backup serialization). Page titles, focus, timestamps and favicons are not included in this equivalence check.
- Normal backups omit browser tab IDs and browser navigation history. They cannot establish the exact original live-tab identity, explain the earlier overwrites, or prove browser-history preservation.

## Suggested recovery direction

The duplicate count of seven is correct, but it is not proof that the historical tree has been restored. A further recovery should use the 05:30 original URL-to-entry and parent relationships as historical evidence, keep current live browser tab identities, and reconcile intentional later edits separately. It should not simply delete more same-URL entries. The historical URLs and relationships needed to investigate these issues are preserved in the supplied backups.

No additional repair has been applied as part of this audit.

## URLs already absent before the latest cleanup

The following entries from 16 November had lost their full URL by 24 November 05:30. “Same ID changed URL” often reflects navigation or a URL update; “entry removed” does not prove an accidental deletion. Full URLs, replacement records, and input file hashes are in `audit-details.json`.

| Entry ID | Earlier page | First observed outcome |
| --- | --- | --- |
| 1m7df3m0e--mac | 曹云斌 Revin Cao的视频会议 - Lark | Same ID changed URL |
| 1kvv4x8r8-01-mac | 65,823.4 BTC USDT 永续合约 \| 欧易 | Same ID changed URL |
| 1m2jqxp0t--mac | 160.15 xNVDA USDT 现货网格交易 \| 交易机器人 | Entry removed |
| 1m79am0k5--mac | (3484) 谁成了漂亮商K小姐姐的接盘侠？\| 男人一定要过女人关 \| 如何判断女人吃过、见过、玩过 - YouTube | Entry removed |
| 1m758b9yq--mac | webdav for flclash - Google Search | Entry removed |
| 1m48zhy35--mac | 日本人玩得好花！人类“癖”大赏，一口气看完三观炸裂深夜剧《下辈子我再好好过》_哔哩哔哩_bilibili | Same ID changed URL |
| 1m3apfpt6--mac | Just a moment... | Same ID changed URL |
| 1m62t827k--mac | (3484) 从刘德华到成龙，港星们为何集体堕落成这样？香港电影是怎么没落的？從劉德華到成龍，港星們爲何集體墮落成這樣？香港電影是怎麼沒落的？夸克说\|誇克説 - YouTube | Entry removed |
| 1m7dewys3--mac | (3484) 黄仁勋辞职疑团大盘点：马斯克、贝索斯都有婚外情，为什么只有老黄栽了？英伟达会凉凉吗？FBI查了一年，为什么不抓黄乐？夸克说 - YouTube | Entry removed |
| 1m7cmjrwy--mac | 红警刷兵位置抢个基地!简直富得我受不了! - YouTube | Entry removed |
| 1kxck308e--mac | 日报 | Same ID changed URL |
| 1m77r2z3a--mac | 配个季候风 加拿大 王菲 - Google Search | Entry removed |
| 1kzb5rs9k--mac | 周报 | Same ID changed URL |
| 1m782fa1s--mac | (3484) 打赏1000元，主播可能只拿200？团播的钱被谁赚走了 - YouTube | Entry removed |
| 1m6tvpdh0--mac | macos set dock tooltip size - Google Search | Entry removed |
| 1m7b3srw0--mac | 运动会痴汉 - Google Search | Entry removed |
| 1m7b3tbtt--mac | NHDTA-279 - Google Search | Entry removed |
| 1m7b40hp5--mac | 金发美少女fuck abigalla johnson NHDTA - Google Search | Entry removed |
| 1m7b3z1bj--mac | 裸の大陆 特别篇 - Google Search | Entry removed |
| 1m7b466fk--mac | 极限2穴痴汉 - Google Search | Entry removed |
| 1m7b4bk54--mac | NHDTA-280 - Google Search | Entry removed |
| 1m2r1v24b--mac | (3203) [玛萨咪Ovo] 20250623 \|美女\|热舞\| - YouTube | Entry removed |
| 1m2r1vd1r--mac | (3203) 【B站福利】玛萨咪 小短裤有亮点 极品开火车 直播性感剪辑cut bilibili dance douyin - YouTube | Same ID changed URL |
| 1m4wwttv5--mac | NHDT-488 女學生自行車私刑隊 - nJAV \| 免費高清AV在線看 | Entry removed |
| 1m49pb4ce--mac | jav.guru/990077/sdde-766-the-man-who-can-stop-time-for-only-10-minutes-is-real-ill-paint-your-youth-white-irresponsible-creampie-edition-for-annoying-schoolgirls/ | Entry removed |
| 1m49pb739--mac | SDDEその他4 - 素人系総合 wiki | Entry removed |

Files: [structured audit details](./audit-details.json) · [read-only audit code](../audit-backups.cjs)
