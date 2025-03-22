import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Track metrics for each step
const uploadTrend = new Trend("upload_time");
const configsTrend = new Trend("configs_time");
const fullBuildTrend = new Trend("full_build_time");
const compileTrend = new Trend("compile_time");
const downloadTrend = new Trend("download_time");

// Get the API host from environment or default to localhost:8080
const API_HOST = __ENV.API_HOST || 'localhost:8080';

export let options = {
  // Uncomment and adjust this section when you want to run load tests
  stages: [
    { duration: "30s", target: 50 }, // Ramp up to 50 users over 30 seconds
    { duration: "1m", target: 50 }, // Stay at 50 users for 1 minute
    { duration: "30s", target: 0 }, // Ramp down to 0 users over 30 seconds
  ],
  
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
  console.log("Test Summary:");

  // Create custom summary with our metrics
  const customSummary = {
    "Average Upload Time (ms)": uploadTrend.avg,
    "Average Configs Time (ms)": configsTrend.avg,
    "Average Full Build Time (ms)": fullBuildTrend.avg,
    "Average Compile Time (ms)": compileTrend.avg,
    "Average Download Time (ms)": downloadTrend.avg,
  };

  console.log(JSON.stringify(customSummary, null, 2));

  // Create report file
  return {
    stdout: textSummary(data, { enableColors: true }) + "\n\nCustom Metrics:\n" + JSON.stringify(customSummary, null, 2),
    "summary.json": JSON.stringify(data),
  };
}
