import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

// Track metrics for each step
const uploadTrend = new Trend("upload_time");
const configsTrend = new Trend("configs_time");
const fullBuildTrend = new Trend("full_build_time");
const compileTrend = new Trend("compile_time");
const downloadTrend = new Trend("download_time");

// Get the API host from environment or default to localhost:8080
const API_HOST = __ENV.API_HOST || "localhost:8080";
const VU_COUNT = 10;

export let options = {
  // Stress test configuration
  stages: [
    // { duration: "30s", target: 250 },    // Ramp up to 250 users
    // { duration: "1m", target: 250 },     // Stay at 250 users
    // { duration: "30s", target: 500 },   // Ramp up to 500 users
    // { duration: "1m", target: 500 },    // Stay at 500 users
    // { duration: "30s", target: 750 },   // Ramp up to 750 users
    // { duration: "1m", target: 750 },    // Stay at 750 users
    { duration: "30s", target: VU_COUNT },
    { duration: "1m", target: VU_COUNT },
    { duration: "30s", target: 0 },
    // { duration: "1s", target: 1 },
  ],

  // Additional stress test settings
  thresholds: {
    http_req_failed: ["rate<0.1"], // Less than 10% of requests can fail
    http_req_duration: ["p(95)<5000"], // 95% of requests should be below 5s
  },

  // Add InfluxDB output
  influxdb: {
    // URL and DB name are defined when running k6 with the docker-compose setup
    url: __ENV.INFLUXDB_URL || "http://localhost:8086",
    database: __ENV.INFLUXDB_DB || "k6",
    username: __ENV.INFLUXDB_USER || "",
    password: __ENV.INFLUXDB_PASSWORD || "",
    tags: { testname: "winvmj-account-test" },
  },
};

export function setup() {
  // Log the InfluxDB URL for troubleshooting
  console.log(`Using InfluxDB URL: ${options.influxdb.url}`);
  console.log(`Using API Host: ${API_HOST}`);

  return {};
}

const file = open("./winvmj-account.zip", "b");

export default function () {
  let timeStart, timeEnd, timeTaken;

  // 1. POST request with file upload
  timeStart = new Date().getTime();
  const fd = {
    folder: http.file(file, "winvmj-account.zip"),
  };

  let uploadResponse = http.post(
    `http://${API_HOST}/api/folder/upload-build`,
    fd
  );

  check(uploadResponse, {
    "upload status is 200": (r) => r.status === 200,
    "upload time is less than 1000ms": (r) => r.timings.duration < 1000,
  });

  timeEnd = new Date().getTime();
  timeTaken = timeEnd - timeStart;
  uploadTrend.add(timeTaken);
  // console.log(`Upload took: ${timeTaken}ms`);

  sleep(1);

  // 2. GET configs
  timeStart = new Date().getTime();
  let configsResponse = http.get(`http://${API_HOST}/api/folder/configs`);

  check(configsResponse, {
    "configs status is 200": (r) => r.status === 200,
    "configs time is less than 500ms": (r) => r.timings.duration < 500,
  });
  timeEnd = new Date().getTime();
  timeTaken = timeEnd - timeStart;
  configsTrend.add(timeTaken);
  // console.log(`Configs took: ${timeTaken}ms`);

  sleep(1);

  // 3. GET full-build
  timeStart = new Date().getTime();
  let configs = [
    "/app/uploads/winvmj-account/configs/default.xml",
    "/app/uploads/winvmj-account/configs/OverdraftAccount.xml",
    "/app/uploads/winvmj-account/configs/TesAccount.xml",
    "/app/uploads/winvmj-account/configs/RaibBank.xml",
  ];
  let config = configs[3];
  let fullBuildResponse = http.get(
    `http://${API_HOST}/composer/full-build?config=${config}`
  );

  check(fullBuildResponse, {
    "full-build status is 200": (r) => r.status === 200,
    "full-build time is less than 2000ms": (r) => r.timings.duration < 2000,
  });
  timeEnd = new Date().getTime();
  timeTaken = timeEnd - timeStart;
  fullBuildTrend.add(timeTaken);
  // console.log(`Full Build took: ${timeTaken}ms`);

  sleep(2);

  // 4. GET compile
  timeStart = new Date().getTime();
  let srcDir = "/app/uploads/winvmj-account/src";
  let compileResponse = http.get(
    `http://${API_HOST}/source-compiler/compile?srcDir=${srcDir}`
  );

  check(compileResponse, {
    "compile status is 200": (r) => r.status === 200,
    "compile time is less than 2000ms": (r) => r.timings.duration < 2000,
  });
  timeEnd = new Date().getTime();
  timeTaken = timeEnd - timeStart;
  compileTrend.add(timeTaken);
  // console.log(`Compile took: ${timeTaken}ms`);

  sleep(2);

  // 5. GET download
  timeStart = new Date().getTime();
  let downloadResponse = http.get(`http://${API_HOST}/api/folder/download`);

  check(downloadResponse, {
    "download status is 200": (r) => r.status === 200,
    "download time is less than 3000ms": (r) => r.timings.duration < 3000,
  });
  timeEnd = new Date().getTime();
  timeTaken = timeEnd - timeStart;
  downloadTrend.add(timeTaken);
  // console.log(`Download took: ${timeTaken}ms`);

  sleep(1);
}

export function handleSummary(data) {
  let fields = [
    "upload_time",
    "configs_time",
    "full_build_time",
    "compile_time",
    "download_time",
    "http_req_blocked",
    "http_req_duration",
    "http_req_duration{expected_response:true}",
    "http_req_connecting",
    "http_req_sending",
    "http_req_waiting",
    "http_req_receiving",
    "http_req_tls_handshaking",
    "iteration_duration",
  ];

  let summary = `
|   | avg | min | med | p(90) | p(95) | max |
| - | - | - | - | - | - | - |
  `;

  fields.forEach((field) => {
    let metric = data.metrics[field].values;
    console.log(metric)
    if (metric) {
      summary += `| ${field} | ${metric.avg} | ${metric.min} | ${metric.med} | ${metric["p(90)"]} | ${metric["p(95)"]} | ${metric.max} |\n`;
    }
  });

  summary += `

| | rate | passes | fails |
| - | - | - | - |
| http_req_failed | ${data.metrics.http_req_failed.values.rate} | ${data.metrics.http_req_failed.values.passes} | ${data.metrics.http_req_failed.values.fails}
  `

  console.log(summary);

  // Create custom summary with our metrics
  const customSummary = {
    // Existing metrics
    "Average Upload Time (ms)": uploadTrend.avg,
    "Average Configs Time (ms)": configsTrend.avg,
    "Average Full Build Time (ms)": fullBuildTrend.avg,
    "Average Compile Time (ms)": compileTrend.avg,
    "Average Download Time (ms)": downloadTrend.avg,

    // Stress test specific metrics
    "HTTP Request Error Rate": data.metrics.http_req_failed.rate,
    "HTTP Request Duration (p95)": data.metrics.http_req_duration["p(95)"],
    "HTTP Requests per Second": data.metrics.http_reqs.rate,
    "Max VUs Reached": data.metrics.vus_max.value,
  };

  console.log(JSON.stringify(customSummary, null, 2));

  // Create report file
  return {
    stdout:
      textSummary(data, { enableColors: true }) +
      "\n\nCustom Metrics:\n" +
      JSON.stringify(customSummary, null, 2),
    "summary.json": JSON.stringify(data),
  };
}
