const crypto = require("crypto");

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).slice(12).toString("base64");
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).slice(16).toString("base64");
  return { publicKey: pub, privateKey: priv };
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    // Random endpoint: 162.159.192.1:500 to 162.159.192.20:500
    const randomIP = `162.159.192.${Math.floor(Math.random() * 20) + 1}`;

    const { publicKey, privateKey } = generateKeypair();

    const body = JSON.stringify({
      key: publicKey,
      install_id: crypto.randomUUID(),
      fcm_token: "",
      tos: new Date().toISOString(),
      model: "PC",
      serial_number: crypto.randomUUID(),
      locale: "en_US",
    });

    // Retry with exponential backoff (1s → 2s → 4s) for 429/5xx
    let data;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch("https://api.cloudflareclient.com/v0a2158/reg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (res.ok) {
        data = await res.json();
        break;
      }

      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }

      throw new Error(`API error ${res.status}`);
    }

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
Endpoint = ${randomIP}:500
PersistentKeepalive = 20`;

    // 🔥 မူရင်း WireGuard အက်ပ် မဖတ်နိုင်အောင် ရှေ့မှာ PHX-VPN-ONLY ထည့်လိုက်တယ် 🔥
    const finalConfig = 'PHX-VPN-ONLY\n' + configStr;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ config: finalConfig }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: err.message || "Failed to generate configuration." }),
    };
  }
};
