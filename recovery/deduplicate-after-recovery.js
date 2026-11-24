// TKTSTO second-pass cleanup, version 2026-11-24.dedup.1.
// Run AFTER reconnect-restored-tabs-latest.js apply(), in the same worker Console.
// Paste the whole file for a read-only preview. Apply: await tktstoDedup.apply()
// Undo this pass only: await tktstoDedup.undo()
// Leaves tktstoRecovery and its first-pass snapshot intact.
// Targets 82 diagnosed pairs; protects all eight distinct Moka job URLs.
// Does not open, close, move, reload, or navigate any Chrome tab.
void (async () => {
  'use strict';
  const SESSION_START = 1782236513300;
  const SOURCE_EXPORT = 1795469426184;
  const VERIFIED_EXPORT = 1795473279068;
  const VERSION = '2026-11-24.dedup.1';
  const MOKA_BASE = 'https://app.mokahr.com/apply/moonshot/148506';
  const RESTORED_WINDOWS = ['1m854z49m--mac', '1m854z49a--mac', '1m854z27q--mac', '1m854z49p--mac'];
  // [retained ID, removed ID, retained ctime, removed ctime, exact URL SHA-256, retained window, removed window]
  // Prefer the oldest pre-crash entry, then a saved reconstruction in the live window.
  // Keep the live entry if its only reconstruction belongs to a separate saved window.
  const PAIRS = /* DUPLICATE_MANIFEST */ [
    ["1m856bn96--mac", "1m854zsf9--mac", 1795470775590, 1795469338089, "8ee26d71116342855d2479345a9717c02bb1a691808a8d90e370148651bd1682", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kwv1s620--mac", "1m856bnnv--mac", 1783319271489, 1795470775995, "43f35e89a46128f013dc37ecf14befe114a99a76a27dcac5ae917699864c7e7e", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kwkqapmg--mac", "1m856bp1j--mac", 1783073430163, 1795470776370, "4f6f2a2850970c0e17914044104dd573e9669b5720e426fc44d64f8893087a36", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bp7d--mac", "1m854zsrr--mac", 1795470776557, 1795469338392, "eb4504ef49db269f0ba02fd01ab4882e81e0ed03cdb1534ee19d810bd8df2547", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzbf9cef--mac", "1m856bpn3--mac", 1786017788368, 1795470776995, "eafa5f2d3bc455a0d8dc6a5fb9e5ee36c9968ac4736dcd9addee063def1522f3", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bq14--mac", "1m854zsxp--mac", 1795470777380, 1795469338550, "f124a9f0f264912068f610d9debcfd1f13df526c3d7eba3e47ed80fc808aa729", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzr90b7a--mac", "1m856bqak--mac", 1786447408362, 1795470777683, "30c233097085441db8dc297e3d8f15de6fb2b5ff695374c5b01357e5ba6c6185", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bqsa--mac", "1m854zt2x--mac", 1795470778154, 1795469338717, "d66715ed3504194bfedc36ffa36a86f2d0eceff5abdfd87944269eae42c3d475", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7nafqz6--mac", "1m856bd7t--mac", 1794938232807, 1795470767354, "2f83bf6d054817fff9364e9a73b44c547550677014e73552668956a97edab0a6", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bdpv--mac", "1m854zp3s--mac", 1795470767835, 1795469334649, "50ad4cd4634727cc9231088e7076649dd1f7bc13a7fb558019159916b7be388f", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856be47--mac", "1m854zp6z--mac", 1795470768263, 1795469334751, "68fb7c4a3c51eabc4d6e88586ec69a0f1e660dbc44b05712958962e9f3a69ef4", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7j9297s--mac", "1m856be8w--mac", 1794836079865, 1795470768416, "c966347ba471f16a3d890c159754731b703455defca7c83ee2f517ebafb5ff77", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7mf75gk--mac", "1m856bee6--mac", 1794909640211, 1795470768582, "ac6edbb737d727d2f108da398b9f79275dae2eae763b957c3da5cb5e316a065a", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bem1--mac", "1m854zpzk--mac", 1795470768770, 1795469335539, "e8eb096002c2930985c0964c1c046c3cc1ee380b1ff9282844fc45184ab3aac1", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7jbj98d--mac", "1m856beqg--mac", 1794838701326, 1795470768880, "2d43914d5b13b63b43ea33115bf7060f0d5e657b62e7121005b59a9cd959cfae", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bf94--mac", "1m854zqh5--mac", 1795470769444, 1795469336101, "923673dbbc37af1d29db4311a672871474b8d1637bcedf1100411a3d7d10cc4d", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bfgm--mac", "1m854zqkc--mac", 1795470769684, 1795469336172, "54cf6451c090ccf0126309e877e1738f88ae878499c75055666be075ef66f04b", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m77sgd71--mac", "1m856bfrz--mac", 1794484221153, 1795470769952, "cf22840e50e4b095d22f9667c78d492311b3a182e2dc7ad1d1e0b7dfc4abf29f", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m77mwrr2--mac", "1m856bg4h--mac", 1794479383298, 1795470770321, "157e712d80940633839f7125cd87598323b3d5dd00dbe18405fd7c1516120b86", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bgcz--mac", "1m854zqz0--mac", 1795470770591, 1795469336544, "a6533ee51fbb2d7f5d052bff785bc5d93895ee543bb31375b4cf682b4d721eb9", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kxck308e--mac", "1m856bgjb--mac", 1783907844366, 1795470770766, "634e1b510eac34e427658c6295a4810d480bd9ac4f054caf4fed51ad2e9e0a66", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bgvb--mac", "1m854zr3h--mac", 1795470771051, 1795469336689, "f96f94d2b5917018a0242cb3cd77d6d3391a9612a841d54bcb75e1f13b0d1430", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7jq09yf--mac", "1m856bh5b--mac", 1794850695119, 1795470771371, "1dde1c5626e1bd5e8996a97552f4a4f8cba6b58c60bcc229a0e39f9932b63060", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bhh7--mac", "1m854zrbm--mac", 1795470771751, 1795469336948, "954e492fe5ff1a5dd0c0b9dbbf129425c2108c0ea66a69054421c43c1a428f76", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6tfbmde--mac", "1m856bhrj--mac", 1794037371310, 1795470771986, "d16c0e54733807865c438d771ddcbbfb4a443998bdd7a0a3739f5e6371b03972", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6twrrrc--mac", "1m856bhw9--mac", 1794051433228, 1795470772105, "e7a08c7576133d1219e7bd3c935f2920808f8e52366c275250cddec2f9012c50", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6tt2mdn--mac", "1m856bj18--mac", 1794048610741, 1795470772264, "8e31d1ee87f8e4dd18557dc12297fa6206e994a214f721cb006dc2235a964cb3", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bj5y--mac", "1m854zrms--mac", 1795470772415, 1795469337241, "c1c10dd17d5e25bd07fbb2574faea4dd478e12ac63bd2323c62b4568d7e897df", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6xptp4a--mac", "1m856bjdd--mac", 1794145867914, 1795470772653, "89f2d51d28a6f2fc5f25f3cb773ea49d56bb3194a0df89f7b9e64e7f9aa5042c", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6y8mq61--mac", "1m856bjmg--mac", 1794164546753, 1795470772880, "e13bde8da3ff993de5c0b91affc3d9fc39f0578e8fdb771b9218acec81392624", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bjsq--mac", "1m854zrx3--mac", 1795470773047, 1795469337507, "e58f14dc36b291098fa63d9122ebe649b14f788b5b7a770feb3aa53261141576", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6y4dape--mac", "1m856bk12--mac", 1794160110288, 1795470773282, "bb89c1a5889e8a225e17426d6e137b35d492f64cea57f9b3536de0eea75b7b0a", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6y4de1n--mac", "1m856bk5f--mac", 1794160113717, 1795470773426, "f0eabb10d1ed3709aad2c80f587c6f0803a604871d285a5c247be899ec8cb649", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bkd4--mac", "1m854zs5t--mac", 1795470773668, 1795469337786, "78b63745049a8dc0cb5aa9455d7fcc008d3d90ebe2cd1f84329efa853b60f8bd", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m856bm8z--mac", "1m854zs89--mac", 1795470774559, 1795469337865, "e876536efd8255e09c9bd62f7118a3e90647d2b5a879e7db69cbb753905b197f", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzhw6eg4--mac", "1m856bmk6--mac", 1786232650245, 1795470774886, "09cccc0fd8cc7be64c37ab20a43bca5f16a0d30e4da285ad11475850d4797b2e", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m136snsm--mac", "1m856bmrp--mac", 1787887933236, 1795470775062, "4497e39b720b3a59487acafa3e19c18d1303cbc839f4495bc37d18723265d065", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m84g10e2--mac", "1m854zfyy--mac", 1795447357890, 1795469328350, "2e062096b62fd383b3a2502fe97596b40badf1596960cf09080a029974c399b8", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m7s4kryv--mac", "1m7yqfzrv--mac", 1795066291163, 1795253862171, "11ef626eb4b123988d9c2a2e669af83879b9451267a2aeab2aa2e787cf4f24d2", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m27nkvw0--mac", "1m7b1n530--mac", 1789111431042, 1794593428577, "7db2978988414eec2976506b696909e3b2f3a22518afd1469ae91d5648f422ad", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m2m5mp5x--mac", "1m6xnjpb8--mac", 1789530888381, 1794144557416, "b914ab58bacd4c7ec2bb71f4e93cfe5010c861c94cbbe5f5865bdfc9417ea5d8", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m36h9chn--mac", "1m66gfgg5--mac", 1790147080757, 1793367458309, "0bda5bc89e10c99a433204c31cd30a3db722f83e1ba5b5c920110c37489f7f8f", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m62s3h0f--mac", "1m6bg6wwm--mac", 1793242285071, 1793534948244, "e4558e01ee2798720f6cbe874755fd1c560ab0d0d7b8db72b74cbf89e1673187", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6z66peg--mac", "1m7sqtm0w--mac", 1794195544528, 1795086438429, "c191e79233c43208938042e0b2fdf14a12dd078e13e142cce662284184e74e7a", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kyy40p62--mac", "1m6xnjg2j--mac", 1785569761474, 1794144550994, "b974f27c0b596201ca2495b9955b96067ab4deca99654cf9b7470570ee508c19", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzr90j43--mac", "1m60zbb2s--mac", 1786447415427, 1793181723737, "7da8738bc2c7de3e32f6c10c4eeb455854e75452dc82dc2b94a59772a9411a6d", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m05c4ab1--mac", "1m60nbcew--mac", 1786886891880, 1793171239388, "a4af328a33c0e07694674acfd00884550c58ef11d79ca6453d3a09f1054c1901", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m63gxeaq--mac", "1m6dzvrt1--mac", 1793190434164, 1793618469697, "7cb39bd317cdc974b9712079e6158de5184d2ed9b1c90dbad2a7b3dd63e4f614", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m63gxeam--mac", "1m6dzvw3d--mac", 1793190466430, 1793618473070, "74560ed07cdbcc15576a7cc59b92a72c1cdd29fb97564c7cf17e330f72e52a03", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m0f2w2td--mac", "1m6ghxe8d--mac", 1787212729165, 1793704507662, "dd206e20e6c24f259bfd2f580d8e59c0b00d231fd0d7da0c151e6c2b39c0ab2e", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kz5a5myt--mac", "1m6j6jmzf--mac", 1785811096538, 1793759728623, "742ccc2e1e7cf7a71b2ac00abba4552fcaea4c0a68484ba1f20b014e251ede9b", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzr908a4--mac", "1m854zm59--mac", 1786447405380, 1795469332649, "adc1d8737046a641f4f198f37cab4beaf12afa7b2f8a8ea58b0415efb1e42722", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kzr90mh1--mac", "1m856br1e--mac", 1786447417889, 1795470778415, "893ff47af2dd974f30f2823cf88dec8a3eb15cbcac5bd5ab8eb8bb8ab5568814", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1kzvper9b--mac", "1m856brbf--mac", 1786562175275, 1795470778735, "f87d0ecdb15057eb71df54de6b76855151bb1afea9de6166743a788593735c2b", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m6dzv692--mac", "1m856brqx--mac", 1793618450722, 1795470779133, "e2452e6780919c35853e534eff052d3fa4fa8f16af1ad34b736ceb6a5aca8d52", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m6dzw5j0--mac", "1m856bs34--mac", 1793618482752, 1795470779492, "0c82265b921f5ddd64cc9637d99cd4bce078bc9a6c8f6939dd23890b03d1f57d", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m055twb8--mac", "1m854zmv3--mac", 1786880291176, 1795469333347, "55b315b3f283dd51bae315598cc80afede2311785ac90e88772b0e193bf8d85b", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m0f0a1e9--mac", "1m856bsc7--mac", 1787210040777, 1795470779783, "49a42f60f3b7588ad707e8b4f8ce9b74c9428888710c9a076f6019c76e68d2a2", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1kyw6d5ab--mac", "1m856bsg1--mac", 1785505158475, 1795470779920, "d1b3375ef51d8b1b8853515620385423fb9ea4618b5f60449794b8debc3f7167", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f078an--mac", "1m856bsnf--mac", 1787209949525, 1795470780079, "6e057107866a297f4c270cf4f65483aa5fbbe47b58097a6958780a5985198545", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f07ch1--mac", "1m854zn05--mac", 1787209953825, 1795469333509, "28d933fa63ffdfe2cbf924379af1e2b51c3a65d1c2e22251f51612358e3492e0", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m0f07gnt--mac", "1m856bsxc--mac", 1787209958074, 1795470780332, "8fd125709892bc0a0f59331b0bcad7a5e1caa4f91faaa9abf7c06c76e6abed39", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m055mvmq--mac", "1m856bt4y--mac", 1786880093848, 1795470780574, "ffdb80d035683f7b25af0b969609fb86d10f8d856e38281947e91c62b63fc476", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f27jxe--mac", "1m854zn2j--mac", 1787212057518, 1795469333586, "5e009c99fa9558559b83352a56c66e77e8806706a6788075637a88741e82ee9b", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m0f224ev--mac", "1m856btam--mac", 1787211878875, 1795470780756, "ca215bab02c0cc8b1eb95b920170cb9cfb01a1fcb3bd1a93aaf0757d679f70ca", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f2hgs4--mac", "1m856btbh--mac", 1787212383012, 1795470780785, "4b631c1a93b50b0515785eeb46390c23023c317fc25b6631d1fbc216a60e4682", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f2hvbx--mac", "1m856btma--mac", 1787212393854, 1795470781069, "aa2b10073991079f070457578ad6c179890734e8ba9c9035614c70e41c25a672", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f1qcj4--mac", "1m856btph--mac", 1787211526724, 1795470781137, "196569ddfdd39af55f0713750f522cfda5324e6fe3dcfa1521c36a278d241274", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0f0ahb4--mac", "1m856btq3--mac", 1787210057060, 1795470781155, "6e868f907fffcafb5d94b5b6947b576c27a5b6228a324dbc1dfdfc5502154777", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0cwwf7e--mac", "1m856btze--mac", 1787139341550, 1795470781422, "f3a5245a9bb694694344f0eed51e4658589867e8c13230318a6918e00460c44b", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m0c7yjkp--mac", "1m856bv60--mac", 1787117390454, 1795470781643, "11c45c456140d952c82df4061b1b2120a2d50a431600aa105d6b53df9c90ce89", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m5efh8mz--mac", "1m856bvnv--mac", 1792561160863, 1795470782139, "2d6ec27a8828bfc1578ece40bd3a8b8d9e03bf98c0d05a92172d11f16c7d5b85", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1kztq8g4v--mac", "1m854zndm--mac", 1786529464475, 1795469333940, "fe71f0bd986796474c7097f0ef8d5556d9fd2afaf68cb7558004fdfa876cbadb", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1m6gdkc40--mac", "1m854znnz--mac", 1793699983488, 1795469334207, "5025c03b105f06fe4131c99626e0c2a93419b49859c37c590474e6ecd287d293", "1kvwryyv4-01-mac", "1kvwryyv4-01-mac"],
    ["1kvwryyvk-01-mac", "1m856bw6p--mac", 1782236513532, 1795470782678, "f92222ad114d95beb81d8643b23dd5e682af6584a60475612766699d38ad55e0", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854ztaw--mac", "1m856brmk--mac", 1795469338972, 1795470779027, "84d7b204c85f650eecbc941252e88f00e7e03605cb602d55446a60122885afeb", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854ztfz--mac", "1m856brsv--mac", 1795469339135, 1795470779195, "4c5d3f88e564f0f48dca2134da19c6bb99235890835621a99cdd30e45b73cf21", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854ztjd--mac", "1m856brzy--mac", 1795469339213, 1795470779390, "755baf6f6a5063463072b13d84be6db45950514d4e055a31d896dab7139738b5", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854ztqr--mac", "1m856bs4x--mac", 1795469339384, 1795470779549, "655ea374487144c8b2647fb9bce6223dbe6fefd45ed19fb24654830d5dc86646", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854ztte--mac", "1m856btsc--mac", 1795469339470, 1795470781228, "aac73e56388dc7a2e3ee184224bb32bdf7c17a8ae0b0a1415bc67266c67e902e", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854zvbf--mac", "1m856bvzk--mac", 1795469340015, 1795470782451, "013a31eb6f2bf142e9c1adc4afe927110779c31353c1875f8503b6dcf25ae700", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
    ["1m854zvjy--mac", "1m856bw0v--mac", 1795469340254, 1795470782492, "db7ef7864205057b2bd17860a44a236062a4eed61afe8182bc48c5bbc03559c4", "1kvwryyv4-01-mac", "1m856bqzh--mac"],
  ];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(typeof chrome !== 'undefined' && chrome.runtime?.id
    && typeof document === 'undefined',
  'Use the TKTSTO service worker console, opened from chrome://extensions.');
  assert(!globalThis.tktstoDedup?.busy, 'A recovery is already running.');
  assert(!globalThis.tktstoDedup?.backupKey,
    'Recovery is already installed and has a rollback snapshot. Use tktstoDedup.undo() instead of pasting again.');

  // queryObjects is a DevTools command that prints an array; it does NOT
  // return that array to JavaScript. "Store as global variable" supplies it.
  const backgrounds = new Set();
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(globalThis))) {
    if (!/^temp\d+$/.test(key) || !Array.isArray(descriptor.value)) continue;
    for (const value of descriptor.value) {
      if (typeof value !== 'function' || value.name !== 'emit') continue;
      const bg = Object.getOwnPropertyDescriptor(value, 'bkgd')?.value;
      if (bg?.tree?.db && bg.tree.bkgd === bg) backgrounds.add(bg);
    }
  }
  assert(backgrounds.size === 1,
    'Run queryObjects((async () => {}).constructor), then right-click its output array and choose Store as global variable. Paste this file again.');
  const bg = [...backgrounds][0];
  await bg.treeLoaded;
  const tree = bg.tree;
  assert(tree.root.ctime === SESSION_START && tree.cfg.clientId === 'mac',
    'This script belongs to a different TKTSTO session. Nothing was changed.');
  assert(typeof tree.db.saveNodes === 'function',
    'This TKTSTO build is unsupported. Nothing was changed.');
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = () => clone(tree.serializeNodes());
  const children = node => node.nodes || [];
  const isTab = node => !!node.url && node.type !== 'window';
  const isPink = node => isTab(node) && !node.loaded && !!node.wasLoaded;
  let busy = false;
  let journal = null;

  function descendants(nodes, id) {
    const found = [];
    for (const child of children(nodes[id])) {
      found.push(child);
      found.push(...descendants(nodes, child));
    }
    return found;
  }

  function windowOf(nodes, id) {
    let node = nodes[id];
    while (node && node.id !== 'root') {
      if (node.type === 'window') return node.id;
      node = nodes[node.parent];
    }
    return null;
  }

  function validate(nodes, checkIds = true) {
    assert(nodes.root?.parent === 'root', 'Invalid tree root.');
    const seen = new Set();
    const tabs = new Set(), windows = new Set();
    const visit = id => {
      const node = nodes[id];
      assert(node?.id === id && !seen.has(id), `Missing, repeated, or cyclic node: ${id}`);
      seen.add(id);
      if (checkIds && node.loaded && (isTab(node) || node.type === 'window')) {
        const isWindow = node.type === 'window';
        const liveId = isWindow ? node.windowId : node.tabId;
        const used = isWindow ? windows : tabs;
        assert(Number.isInteger(liveId) && liveId >= 0 && !used.has(liveId), `Invalid or repeated browser ID at ${id}`);
        used.add(liveId);
        if (!isWindow) {
          const owner = nodes[windowOf(nodes, id)];
          assert(owner?.loaded && owner.windowId === node.windowId,
            `Tab/window attachment disagrees at ${id}`);
        }
      }
      for (const child of children(node)) {
        assert(nodes[child]?.parent === id, `Parent/child links disagree at ${child}`);
        visit(child);
      }
    };
    visit('root');
    assert(seen.size === Object.keys(nodes).length, 'The tree has unreachable nodes.');
  }

  function stamp(nodes) {
    // Focus, access times, and page resource state can change just by opening
    // DevTools. Structure, URLs, annotations, and browser identities may not.
    const volatile = new Set(['active', 'atime', 'mtime', 'discarded', 'frozen',
      'hidden', 'faviconUrl', 'geometry', 'windowState', 'browserRestoreToken']);
    return JSON.stringify(Object.keys(nodes).sort().map(id => [id,
      Object.keys(nodes[id]).sort().filter(k => !volatile.has(k))
        .map(k => [k, nodes[id][k]])]));
  }

  async function browserState() {
    const windows = await chrome.windows.getAll({ populate: true });
    const byWindow = new Map(windows.map(win => [win.id, win]));
    const byTab = new Map(windows.flatMap(win => (win.tabs || []).map(tab => [tab.id, tab])));
    const signature = JSON.stringify({
      windows: windows.map(win => [win.id, win.type, !!win.incognito])
        .sort((a, b) => a[0] - b[0]),
      tabs: [...byTab.values()]
        .map(tab => [tab.id, tab.windowId, tab.url, tab.pendingUrl, !!tab.pinned,
          !!tab.incognito, tab.index])
        .sort((a, b) => a[0] - b[0]) });
    return { byWindow, byTab, signature };
  }

  function copyBrowserFields(node, browser, isWindow) {
    node.loaded = true;
    node.wasLoaded = false;
    node.windowId = isWindow ? browser.id : browser.windowId;
    node.active = !!(isWindow ? browser.focused : browser.active);
    node.incognito = !!browser.incognito;
    delete node.browserRestoreToken;
    if (isWindow) {
      node.geometry = [browser.width, browser.height, browser.left, browser.top];
      node.windowState = browser.state;
    } else {
      node.tabId = browser.id;
      node.url = browser.pendingUrl || browser.url;
      if (browser.title) node.title = browser.title.trim().replace(/\s+/g, ' ');
      node.discarded = !!browser.discarded;
      node.frozen = !!browser.frozen;
      node.hidden = !!browser.hidden;
      if (browser.favIconUrl) node.faviconUrl = browser.favIconUrl;
    }
  }

  async function guarded(operation) {
    assert(!busy, 'Recovery is busy.');
    busy = true;
    const unlocks = [];
    let releaseGate, oldBackgroundReady, oldTreeReady;
    try {
      await bg.treeLoaded;
      assert(!bg.nodesLoading.length && !bg.windowsLoading.length && !bg.tabReorderInProgress,
        'TKTSTO is loading or moving tabs. Wait until it finishes.');
      // Match the extension's existing lock order; pending UI work drains
      // before tab creation/replacement are held.
      for (const mutex of [tree.onMessageMutex, tree.onTabCreatedMutex, tree.onTabReplacedMutex])
        unlocks.push(await mutex.lock());
      oldBackgroundReady = bg.treeLoaded;
      oldTreeReady = tree.treeLoaded;
      const gate = new Promise(resolve => { releaseGate = resolve; });
      bg.treeLoaded = gate;
      tree.treeLoaded = gate;
      // Let handlers which already passed the readiness check finish. New
      // browser events wait on the gate; tab updates also wait on the mutex.
      let previous = stamp(state()), stable = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const next = stamp(state());
        if (next === previous) { stable = true; break; }
        previous = next;
      }
      assert(stable, 'The tree is still changing. Wait and try again.');
      return await operation();
    } finally {
      if (releaseGate) {
        bg.treeLoaded = oldBackgroundReady;
        tree.treeLoaded = oldTreeReady;
        releaseGate();
      }
      for (const unlock of unlocks.reverse()) unlock();
      busy = false;
    }
  }

  function install(after) {
    const previous = tree.nodes;
    const next = {};
    for (const [id, dict] of Object.entries(after)) {
      const node = previous[id] || new tree.NodeClass(tree, null);
      node.fromDict(dict);
      // Never retain a recently-closed tab's old identity on an attachment.
      delete node.oldTabId;
      delete node.tabClosedReason;
      delete node.naturalLastOpened;
      delete node.naturalExternalRoot;
      next[id] = node;
    }
    for (const [id, node] of Object.entries(next)) {
      node.parent = next[after[id].parent];
      node.nodes = children(after[id]).map(child => next[child]);
    }
    tree.nodes = next;
    tree.root = next.root;
    tree.markedNodes = Object.values(next).filter(node => node.marked);
    for (const [id, node] of Object.entries(previous)) {
      if (next[id]) continue;
      node.parent = null;
      node.nodes = [];
      node.loaded = false;
      node.tabId = undefined;
      node.windowId = undefined;
    }
  }

  async function commit(before, after, reason) {
    const db = await tree.db.db;
    assert(stamp(state()) === stamp(before), 'Tree changed during preparation. Preview again.');
    const backupKey = `console-dedup-${reason}-${Date.now()}-${crypto.randomUUID()}`;
    const snapshot = { $schema: 'https://toykeeper.net/tktsto/session-backup-json-schema-v1',
      metadata: { exportDate: Date.now(), sessionStartDate: SESSION_START, clientId: 'mac',
        sourceExportDate: SOURCE_EXPORT, verifiedExportDate: VERIFIED_EXPORT,
        recoveryVersion: VERSION, recoveryReason: reason }, nodes: before };
    await chrome.storage.local.set({ isLatestSnapshotDirty: true });
    assert(stamp(state()) === stamp(before), 'Tree changed before saving. Preview again.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['Nodes', 'Snapshots'], 'readwrite');
      const nodes = tx.objectStore('Nodes');
      tx.onabort = () => reject(tx.error || new Error('Recovery transaction aborted; tree unchanged.'));
      tx.onerror = () => {}; // onabort reports the final transaction failure.
      tx.oncomplete = () => {
        // Same JS task as completion: events cannot observe half an install.
        install(after);
        resolve();
      };
      try {
        tx.objectStore('Snapshots').put({ key: backupKey, data: JSON.stringify(snapshot) });
        for (const [id, dict] of Object.entries(after)) {
          if (JSON.stringify(dict) !== JSON.stringify(before[id]))
            nodes.put({ key: id, data: JSON.stringify(dict) });
        }
        for (const id of Object.keys(before)) if (!after[id]) nodes.delete(id);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
    return { backupKey, snapshot };
  }

  async function refreshViews() {
    if (typeof tree.tree_browserRestored === 'function') {
      try { await chrome.runtime.sendMessage({ msg: 'tree_browserRestored' }); }
      catch { /* no sidebars open */ }
    }
    console.log('Close and reopen the TKTSTO sidebar to refresh its tree.');
  }

  // Use the same comparison as the sidebar badge for reporting only. Actual
  // merging always requires a full exact URL, including query and fragment.
  function duplicateGroups(nodes) {
    const byBase = new Map();
    for (const node of Object.values(nodes).filter(isTab)) {
      const withoutFragment = node.url.split('#')[0];
      const q = withoutFragment.indexOf('?');
      const base = q < 0 ? withoutFragment : withoutFragment.slice(0, q);
      const params = new URLSearchParams(q < 0 ? '' : withoutFragment.slice(q + 1));
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push({ node, params });
    }
    const clusters = members => {
      let common = new Set(members[0].params.keys());
      for (const member of members) common = new Set([...common].filter(key => member.params.has(key)));
      const parts = new Map(), keys = [...common].sort();
      for (const member of members) {
        const key = JSON.stringify(keys.map(k => member.params.getAll(k)));
        if (!parts.has(key)) parts.set(key, []);
        parts.get(key).push(member);
      }
      return parts.size === 1 ? [members]
        : [...parts.values()].filter(part => part.length > 1).flatMap(clusters);
    };
    return [...byBase.entries()].flatMap(([base, group]) => group.length < 2 ? []
      : clusters(group).map(cluster => ({ base, extraCopies: cluster.length - 1,
        entries: cluster.map(({ node }) => ({ id: node.id, url: node.url, title: node.title, loaded: !!node.loaded })) })));
  }

  const badgeCount = groups => groups.reduce((sum, group) => sum + group.extraCopies, 0);
  const protectedMoka = node => node.url?.split('#')[0].split('?')[0] === MOKA_BASE;
  const liveIds = nodes => Object.values(nodes).filter(node => isTab(node) && node.loaded)
    .map(node => node.tabId).sort((a, b) => a - b).join(',');
  const urlHash = async url => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)))]
    .map(value => value.toString(16).padStart(2, '0')).join('');

  function pinnedIn(nodes, id) {
    const win = nodes[windowOf(nodes, id)], first = nodes[win?.nodes?.[0]];
    return !!first && first.label === 'Pinned' && !first.url && first.type !== 'window'
      && first.parent === win.id && (first.id === id || isAncestor(nodes, first.id, id));
  }

  function validateBrowser(nodes, browser) {
    validate(nodes);
    for (const node of Object.values(nodes)) {
      if (!node.loaded) continue;
      if (node.type === 'window') {
        const win = browser.byWindow.get(node.windowId);
        assert(win?.type === 'normal' && !!win.incognito === !!node.incognito,
          `Chrome window no longer agrees at ${node.id}. Nothing changed.`);
      } else if (isTab(node)) {
        const tab = browser.byTab.get(node.tabId);
        assert(tab && tab.windowId === node.windowId && (tab.pendingUrl || tab.url) === node.url
          && !!tab.incognito === !!node.incognito && !!tab.pinned === pinnedIn(nodes, node.id),
        `Chrome tab no longer agrees at ${node.id}. Wait for loading to finish or export a new diagnostic.`);
      }
    }
  }

  function isAncestor(nodes, ancestor, id) {
    let current = nodes[id];
    while (current && current.id !== 'root') {
      current = nodes[current.parent];
      if (current?.id === ancestor) return true;
    }
    return false;
  }

  // Merge only nonconflicting annotations. Different notes/history stay in
  // the tree and stop apply, instead of silently picking one to discard.
  function mergeMetadata(retained, removed, merged) {
    for (const key of ['label', 'note', 'checkbox', 'bookmark', 'tabHistory']) {
      const meaningful = value => key === 'checkbox' ? value !== undefined && value !== null
        : Array.isArray(value) ? value.length > 0 : !!value;
      if (!meaningful(removed[key])) continue;
      if (meaningful(retained[key]) && JSON.stringify(retained[key]) !== JSON.stringify(removed[key]))
        return `Conflicting ${key}; both entries preserved`;
      merged[key] = clone(removed[key]);
    }
    merged.marked = !!retained.marked || !!removed.marked;
    return null;
  }

  async function plan(before, browser) {
    assert(RESTORED_WINDOWS.every(id => !before[id]),
      'This is the second pass. Finish the first recovery apply() before using it.');
    validateBrowser(before, browser);
    const after = clone(before), mapping = new Map(), rows = [], skipped = [];
    const byUrl = new Map();
    for (const node of Object.values(before).filter(isTab)) {
      if (!byUrl.has(node.url)) byUrl.set(node.url, []);
      byUrl.get(node.url).push(node.id);
    }
    for (const [keepId, removeId, keepCtime, removeCtime, expectedHash, keepWindow, removeWindow] of PAIRS) {
      const retained = before[keepId], removed = before[removeId];
      const skip = reason => skipped.push({ retained: keepId, removed: removeId, reason });
      if (!retained || !removed) { skip('One entry is already absent; no change'); continue; }
      if (!isTab(retained) || !isTab(removed) || protectedMoka(retained) || protectedMoka(removed)) {
        skip('Protected Moka URL or changed node type'); continue;
      }
      if (retained.ctime !== keepCtime || removed.ctime !== removeCtime
        || retained.url !== removed.url || await urlHash(retained.url) !== expectedHash) {
        skip('Entry identity or exact URL changed'); continue;
      }
      if (byUrl.get(retained.url).length !== 2) {
        skip('Additional same-URL entry exists; current ownership needs review'); continue;
      }
      if (windowOf(before, keepId) !== keepWindow || windowOf(before, removeId) !== removeWindow
        || isAncestor(before, keepId, removeId) || isAncestor(before, removeId, keepId)) {
        skip('Pair moved to a different window or into an ancestor relationship'); continue;
      }
      if (retained.loaded && removed.loaded) {
        skip('Both entries own live tabs; neither tab will be closed'); continue;
      }
      if (!!retained.incognito !== !!removed.incognito) { skip('Privacy differs'); continue; }
      const merged = clone(retained), conflict = mergeMetadata(retained, removed, merged);
      if (conflict) { skip(conflict); continue; }
      const live = retained.loaded ? retained : removed.loaded ? removed : null;
      if (live) {
        const tab = browser.byTab.get(live.tabId);
        const targetWindow = before[keepWindow];
        if (!targetWindow?.loaded || targetWindow.windowId !== tab.windowId) {
          skip('Saved target does not belong to this live Chrome window'); continue;
        }
        if (merged.bookmark || pinnedIn(before, keepId) !== !!tab.pinned) {
          skip('Bookmark or pinned state conflicts with live tab'); continue;
        }
        copyBrowserFields(merged, tab, false);
        merged.atime = live.atime;
      } else {
        merged.loaded = false;
        merged.active = false;
        merged.wasLoaded = !!retained.wasLoaded || !!removed.wasLoaded;
        delete merged.tabId;
        delete merged.windowId;
      }
      after[keepId] = merged;
      mapping.set(removeId, keepId);
      rows.push({ retained: keepId, removed: removeId, title: retained.title, url: retained.url,
        action: removed.loaded ? 'Reconnect live tab to retained entry' : 'Remove redundant saved copy',
        childrenPreserved: children(removed).length });
    }
    // Project both sides of every parent/child edge. This also preserves
    // children beneath another merged pair without creating dangling links.
    for (const node of Object.values(after)) {
      if (mapping.has(node.id)) continue;
      node.parent = mapping.get(node.parent) || node.parent;
      node.nodes = children(node).filter(id => !mapping.has(id));
    }
    for (const [removeId, keepId] of mapping) {
      for (const child of children(before[removeId])) {
        if (mapping.has(child)) continue;
        after[child].parent = keepId;
        after[keepId].nodes.push(child);
      }
      delete after[removeId];
    }
    validateBrowser(after, browser);
    assert(liveIds(before) === liveIds(after), 'Plan would change the set of live Chrome tab IDs.');
    for (const node of Object.values(before).filter(protectedMoka))
      assert(JSON.stringify(after[node.id]) === JSON.stringify(node), `Moka entry changed: ${node.id}`);
    const beforeGroups = duplicateGroups(before), remaining = duplicateGroups(after);
    const expectedRemaining = remaining.length === 1 && remaining[0].base === MOKA_BASE
      && remaining[0].entries.length === 8 && remaining[0].extraCopies === 7
      && new Set(remaining[0].entries.map(entry => entry.url)).size === 8;
    return { before, after, rows, skipped, remaining, canApply: expectedRemaining && rows.length > 0,
      stats: { duplicateCountBefore: badgeCount(beforeGroups), duplicateCountAfter: badgeCount(remaining),
        removedTreeEntries: rows.length,
        reconnectedLiveTabs: rows.filter(row => row.action.startsWith('Reconnect')).length,
        liveTabs: Object.values(after).filter(node => isTab(node) && node.loaded).length,
        browserTabs: browser.byTab.size, remainingPink: Object.values(after).filter(isPink).length,
        treeEntriesAfter: Object.keys(after).length, preservedMokaEntries: Object.values(after).filter(protectedMoka).length,
        canApply: expectedRemaining && rows.length > 0 } };
  }

  function publish(result) {
    api.stats = result.stats;
    api.matches = result.rows;
    api.skipped = result.skipped;
    api.remainingDuplicates = result.remaining;
  }

  async function preview() {
    assert(!busy && !globalThis.tktstoRecovery?.busy, 'A recovery operation is running.');
    const result = await plan(state(), await browserState());
    publish(result);
    console.log(`TKTSTO second-pass cleanup ${VERSION}: preview only; nothing changed.`);
    console.table([result.stats]);
    console.table(result.rows);
    if (result.skipped.length) console.table(result.skipped);
    console.log('Remaining duplicate groups:', result.remaining);
    console.log(result.canApply ? 'Ready. Run await tktstoDedup.apply()'
      : 'Not ready to apply: current data does not yield only the seven expected Moka matches. Inspect .skipped / .remainingDuplicates and export a new diagnostic.');
    return result.stats;
  }

  async function apply() {
    assert(!journal, 'Second pass already applied. Use tktstoDedup.undo() before applying again.');
    assert(!globalThis.tktstoRecovery?.busy, 'First-pass recovery is running.');
    const outcome = await guarded(async () => {
      const browser = await browserState(), result = await plan(state(), browser);
      publish(result);
      assert(result.canApply, 'Cleanup stopped before writes: the plan must leave only the seven Moka matches. Inspect tktstoDedup.skipped / .remainingDuplicates.');
      assert(browser.signature === (await browserState()).signature, 'Chrome tabs changed. Preview again.');
      const saved = await commit(result.before, result.after, 'before-dedup');
      journal = { ...saved, before: result.before, afterStamp: stamp(state()), browserSignature: browser.signature };
      console.table([result.stats]);
      console.log(`Removed ${result.rows.length} redundant tree entries. All live tabs preserved. Snapshot: ${saved.backupKey}`);
      return { ...result.stats, backupKey: saved.backupKey };
    });
    await refreshViews();
    return outcome;
  }

  async function undo() {
    assert(journal, 'No second-pass cleanup from this console session to undo.');
    assert(!globalThis.tktstoRecovery?.busy, 'First-pass recovery is running.');
    const outcome = await guarded(async () => {
      const browser = await browserState();
      assert(browser.signature === journal.browserSignature && stamp(state()) === journal.afterStamp,
        'Browser or tree changed since this pass. Undo stopped to preserve newer work; the snapshot is still available.');
      validateBrowser(journal.before, browser);
      const saved = await commit(state(), clone(journal.before), 'before-dedup-undo');
      journal = null;
      console.log('Second pass undone. First-pass recovery remains applied.');
      return { undone: true, backupKey: saved.backupKey };
    });
    await refreshViews();
    return outcome;
  }

  async function downloadBackup() {
    const snapshot = journal ? clone(journal.snapshot) : {
      $schema: 'https://toykeeper.net/tktsto/session-backup-json-schema-v1',
      metadata: { exportDate: Date.now(), sessionStartDate: SESSION_START, clientId: 'mac' }, nodes: state() };
    for (const node of Object.values(snapshot.nodes))
      for (const key of ['tabId', 'windowId', 'oldTabId', 'marked', 'browserRestoreToken']) delete node[key];
    return chrome.downloads.download({
      url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snapshot)),
      filename: `tktsto-before-second-pass-${snapshot.metadata.exportDate}.json`, saveAs: false });
  }
  const api = { version: VERSION, preview, apply, undo, downloadBackup,
    get busy() { return busy; }, get backupKey() { return journal?.backupKey || null; } };
  globalThis.tktstoDedup = api;
  await preview();
})().catch(error => console.error('TKTSTO second-pass cleanup stopped:', error));
