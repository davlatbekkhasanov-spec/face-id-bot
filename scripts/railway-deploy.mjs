/** GitHub Actions: env + latest GitHub commit deploy */

const TOKEN = (process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || "").trim();
if (!TOKEN) {
  console.error("RAILWAY_TOKEN yo'q");
  process.exit(1);
}

const API = "https://backboard.railway.com/graphql/v2";

const FACE = {
  projectId: "5034d01f-656a-4fa0-b9c3-400cb702a992",
  environmentId: "bad3f0da-ce42-4eb0-a580-cb5f929d548e",
  serviceId: "4959b353-7e83-4d69-be87-b30b05dc706e",
};

const OMBORGA = {
  projectId: "72321a34-0614-48a2-8e7c-fe353dc05d7b",
  environmentId: "e10ccbb3-8e7e-441e-a157-c36eaf9ab060",
  serviceId: "8f97d319-2d25-4034-b727-aa3e696c7224",
};

const YORDAMCHI = {
  environmentId: "0c014d3f-c05a-4707-a2ad-ebec291f3dcc",
  serviceId: "8c8eaf72-4d94-46b4-bf88-7009c42def2d",
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

async function deploy({ environmentId, serviceId, label }) {
  const q = `mutation($environmentId: String!, $serviceId: String!) {
    serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId)
  }`;
  const data = await gql(q, { environmentId, serviceId });
  console.log(`deploy ${label}:`, data.serviceInstanceDeployV2 ? "OK" : "?");
}

async function main() {
  await gql("{ me { email } }");
  console.log("Railway token OK");

  const omborgaVars = await getVariables(OMBORGA);
  const hubSecret =
    (process.env.YORDAMCHI_HUB_SECRET || omborgaVars.YORDAMCHI_HUB_SECRET || "").trim();
  const hubUrl =
    (omborgaVars.YORDAMCHI_HUB_URL || "https://davlat-yordamchi-bot-production.up.railway.app").trim();

  if (!hubSecret) {
    throw new Error("YORDAMCHI_HUB_SECRET topilmadi (omborga yoki GitHub secret)");
  }

  await upsertVariables({
    ...FACE,
    variables: {
      YORDAMCHI_HUB_URL: hubUrl,
      YORDAMCHI_HUB_SECRET: hubSecret,
      POINTS_ENABLED: "1",
      POINTS_DAILY_PENALTY_CAP: "0",
      ATTENDANCE_TO_GROUP: "0",
      TELEGRAM_POLL: "1",
      DATABASE_DIR: "/data",
      TZ: "Asia/Tashkent",
      LATE_GRACE_MIN: "5",
    },
  });
  console.log("Face ID env: hub OK, cap=0");

  await deploy({ ...FACE, label: "face-id-bot" });
  await deploy({ ...YORDAMCHI, label: "yordamchi-bot" });
}

main().catch((e) => {
  console.error("deploy failed:", e.message);
  process.exit(1);
});
