# Face ID Bot — deploydan keyin ma'lumot yo'qolmasin

## 1. Railway Volume (MAJBURIY)

1. Railway → **FaceIdBot** servis
2. **Volumes** → **Add Volume**
3. **Mount path:** `/data`
4. **Variables:**

```
DATABASE_DIR=/data
TZ=Asia/Tashkent
```

Volume bo'lmasa har deploy yangi bo'sh disk = attendance, qarz, serial dedup yo'qoladi.

Tekshirish: `https://faceidbot-production.up.railway.app/health` → `Volume: OK`

---

## 2. Kod (avtomatik)

| Nima | Qayerda |
|------|---------|
| `/data` papka + eski DB migratsiya | `lib/persist-data.mjs` |
| Har start: SQLite nusxa | `/data/backups/startup_*.db` |
| employees.json nusxa | `/data/backups/employees_*.json` |
| Volume yo'q | logda **CRITICAL** + health `Volume: YOQ` |

---

## 3. Tiklash

Railway → FaceIdBot → **Volumes** → `/data/backups/` ichidagi oxirgi `startup_*.db` ni ko'chiring.

Yoki lokal `data/backups/` dan restore qiling.

---

## 4. Deploy oldin

`/health` da `Volume: OK` bo'lsin. Keyin redeploy xavfsiz.
