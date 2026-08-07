import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  console.log("🌱 Seeding database with realistic PulseCheck sample telemetry...");

  // 1. Create or update demo user
  const email = "demo@pulsecheck.dev";
  const passwordHash = await hashPassword("pulsecheck2026");

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: "Demo Engineer",
        email,
        passwordHash,
        webhookUrl: "https://httpbin.org/post",
      },
    });
    console.log(`Created demo user: ${user.email} (Password: pulsecheck2026)`);
  } else {
    console.log(`Demo user exists: ${user.email}`);
  }

  // 2. Create sample monitors
  const sampleMonitors = [
    {
      name: "GitHub Zen API",
      url: "https://api.github.com/zen",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatusCode: 200,
      failureThreshold: 3,
      recoveryThreshold: 3,
      lastStatus: "operational",
    },
    {
      name: "Cloudflare Edge Trace",
      url: "https://1.1.1.1/cdn-cgi/trace",
      method: "GET",
      intervalSeconds: 30,
      timeoutMs: 5000,
      expectedStatusCode: 200,
      failureThreshold: 3,
      recoveryThreshold: 3,
      lastStatus: "operational",
    },
    {
      name: "HTTPBin Health Probe",
      url: "https://httpbin.org/status/200",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatusCode: 200,
      failureThreshold: 3,
      recoveryThreshold: 3,
      lastStatus: "operational",
    },
  ];

  const createdMonitors = [];

  for (const mon of sampleMonitors) {
    let monitor = await db.monitor.findFirst({
      where: { userId: user.id, name: mon.name },
    });

    if (!monitor) {
      monitor = await db.monitor.create({
        data: {
          ...mon,
          userId: user.id,
          lastCheckedAt: new Date(),
        },
      });
      console.log(`Created monitor: ${monitor.name}`);
    }

    createdMonitors.push(monitor);

    // Seed 24 hours of check history (every 30 mins = 48 data points)
    const existingChecks = await db.checkResult.count({
      where: { monitorId: monitor.id },
    });

    if (existingChecks < 10) {
      const now = Date.now();
      const checksToInsert = [];

      for (let i = 48; i >= 0; i--) {
        const time = new Date(now - i * 30 * 60 * 1000);
        // Realistic simulated latency with slight variance
        const baseLatency = mon.name.includes("Cloudflare") ? 25 : 65;
        const jitter = Math.floor(Math.random() * 30) - 10;
        const responseTimeMs = Math.max(15, baseLatency + jitter);

        // 98% success rate
        const isSuccess = i !== 5; // simulated transient blip 2.5 hours ago

        checksToInsert.push({
          monitorId: monitor.id,
          checkedAt: time,
          statusCode: isSuccess ? 200 : 504,
          responseTimeMs: isSuccess ? responseTimeMs : 4950,
          success: isSuccess,
          errorType: isSuccess ? null : "TIMEOUT",
          errorMessage: isSuccess ? null : "Gateway Timeout exceeded 5000ms",
        });
      }

      await db.checkResult.createMany({
        data: checksToInsert,
      });

      console.log(`Seeded ${checksToInsert.length} historical check records for ${monitor.name}`);
    }
  }

  // 3. Create sample Status Page
  const slug = "demo-status";
  const existingPage = await db.statusPage.findUnique({ where: { slug } });
  if (!existingPage) {
    await db.statusPage.create({
      data: {
        userId: user.id,
        title: "Acme Global API Status",
        description: "Real-time and historical operational performance of core platform APIs.",
        slug,
        isPublished: true,
        selectedMonitorIds: createdMonitors.map((m) => m.id),
      },
    });
    console.log(`Created public status page: /status/${slug}`);
  }

  console.log("✅ Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
