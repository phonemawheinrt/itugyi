const crypto = require("crypto");

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).slice(12).toString("base64");
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).slice(16).toString("base64");
  return { publicKey: pub, privateKey: priv };
}

async function registerDevice(publicKey) {
  const res = await fetch("https://api.cloudflareclient.com/v0a2158/reg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: publicKey,
      install_id: crypto.randomUUID(),
      fcm_token: "",
      tos: new Date().toISOString(),
      model: "PC",
      serial_number: crypto.randomUUID(),
      locale: "en_US",
    }),
  });
  return await res.json();
}

exports.handler = async () => {
  try {
    const endpoints = Array.from({ length: 20 }, (_, i) => `162.159.192.${i + 1}`);
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const { publicKey, privateKey } = generateKeypair();
    const data = await registerDevice(publicKey);

    const peer = data.config.peers[0];
    const iface = data.config.interface;

    const configStr = `[Interface]
PrivateKey = ${privateKey}
Address = ${iface.addresses.v4}/32, ${iface.addresses.v6}/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = ${peer.public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${endpoint}:500
PersistentKeepalive = 20
`;

    // 🔥 မူရင်း WireGuard အက်ပ် မဖတ်နိုင်အောင် ရှေ့မှာ PHX-VPN-ONLY ထည့်လိုက်တယ် 🔥
    const finalConfig = 'PHX-VPN-ONLY\n' + configStr;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain", // .conf ဖိုင်ကို စာသားအဖြစ် ဖတ်နိုင်ရန်
        "Content-Disposition": `attachment; filename="phoenix-tugyi.conf"`, // ဖိုင်နာမည်ကို ပုံသေပေးထားသည်
        "Access-Control-Allow-Origin": "*",
      },
      body: finalConfig, // PHX-VPN-ONLY ပါဝင်သော config အသစ်
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
