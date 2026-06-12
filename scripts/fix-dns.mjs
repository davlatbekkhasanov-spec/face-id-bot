/** Wi‑Fi interfeys DNS ni 8.8.8.8 ga o'zgartirish */
import DigestFetch from "digest-fetch";

const ip = process.env.FACE_DEVICE_IP || "192.168.0.28";
const client = new DigestFetch(
  process.env.FACE_DEVICE_USER || "admin",
  process.env.FACE_DEVICE_PASSWORD || "2024DAVL"
);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IPAddress version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<ipVersion>v4</ipVersion>
<addressingType>dynamic</addressingType>
<ipAddress>192.168.0.28</ipAddress>
<subnetMask>255.255.255.0</subnetMask>
<DefaultGateway><ipAddress>192.168.0.1</ipAddress></DefaultGateway>
<PrimaryDNS><ipAddress>8.8.8.8</ipAddress></PrimaryDNS>
<SecondaryDNS><ipAddress>8.8.4.4</ipAddress></SecondaryDNS>
<DNSEnable>true</DNSEnable>
</IPAddress>`;

const res = await client.fetch(`http://${ip}/ISAPI/System/Network/interfaces/2/ipAddress`, {
  method: "PUT",
  headers: { "Content-Type": "application/xml" },
  body: xml,
});
console.log("DNS fix:", res.status, (await res.text()).slice(0, 200));
