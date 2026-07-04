/** GitHub Actions / local: Railway ga oxirgi GitHub commitdan deploy */

const TOKEN = (process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || "").trim();
if (!TOKEN) {
  console.error("RAILWAY_TOKEN yo'q");
  process.exit(1);
}

const API = "https://backboard.railway.com/graphql/v2";
const DEFAULT_HUB_URL = "https://davlat-yordamchi-bot-production.up.railway.app";

const FACE = {
  projectId: "5034d01f-656a-4fa0-b9c3-400cb702a992",
  environmentId: "bad3f0da-ce42-4eb0-a580-cb5f929d548e",
  serviceId: "4959b353-7e83-4d69-be87-b30b05dc706e",
};

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }
  return data.data;
}

async function getVariables({ projectId, environmentId, serviceId }) {
  const q = `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
    variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
  }`;
  const data = await gql(q, { projectId, environmentId, serviceId });
  return data.variables || {};
}

async function upsertVariables({ projectId, environmentId, serviceId, variables }) {
  const q = `mutation($input: VariableCollectionUpsertInput!) {
    variableCollectionUpsert(input: $input)
  }`;
  await gql(q, {
    input: { projectId, environmentId, serviceId, variables, replace: false },
  });
}

/** Oxirgi GitHub commitdan yangi build + deploy */
async function deployLatest({ environmentId, serviceId, label }) {
  const q = `mutation($serviceId: String!, $environmentId: String!, $latestCommit: Boolean) {
    serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId, latestCommit: $latestCommit)
  }`;
  const data = await gql(q, { serviceId, environmentId, latestCommit: true });
  console.log(`deploy ${label}:`, data.serviceInstanceDeploy ? "OK (latest commit)" : "?");
}

async function main() {
  try {
    const me = await gql("{ me { email } }");
    console.log("Railway token OK:", me.me?.email || "account");
  } catch {
    console.log("Railway token OK (workspace/project scope)");
  }

  const faceVars = await getVariables(FACE);
  const hubSecret = (
    process.env.YORDAMCHI_HUB_SECRET ||
    faceVars.YORDAMCHI_HUB_SECRET ||
    ""
  ).trim();
  const hubUrl = (
    process.env.YORDAMCHI_HUB_URL ||
    faceVars.YORDAMCHI_HUB_URL ||
    DEFAULT_HUB_URL
  ).trim();

  await upsertVariables({
    ...FACE,
    variables: {
      ATTENDANCE_TO_GROUP: "1",
      EXTRA_GROUP_IDS: "-5351426801",
      LATE_GRACE_MIN: "0",
    },
  });
  console.log("Face ID env: keldi/ketdi guruhlari yangilandi");

  if (hubSecret) {
    await upsertVariables({
      ...FACE,
      variables: {
        YORDAMCHI_HUB_URL: hubUrl,
        YORDAMCHI_HUB_SECRET: hubSecret,
        POINTS_ENABLED: "1",
        POINTS_OVERTIME_BONUS: "1",
        POINTS_DAILY_PENALTY_CAP: "0",
        TELEGRAM_POLL: "1",
        DATABASE_DIR: "/data",
        TZ: "Asia/Tashkent",
        ABSENCE_ALERT_HOURS: "2",
      },
    });
    console.log("Face ID env: hub OK");
  } else {
    console.log("Face ID env: hub secret yo'q — faqat deploy");
  }

  await deployLatest({ ...FACE, label: "face-id-bot" });
}

main().catch((e) => {
  console.error("deploy failed:", e.message);
  process.exit(1);
});
