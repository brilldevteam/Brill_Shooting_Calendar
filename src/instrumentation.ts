export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ENABLE_NOTIFICATION_WORKER !== "false" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const state = globalThis as typeof globalThis & {
      brillDeliveryTimer?: ReturnType<typeof setInterval>;
    };
    if (state.brillDeliveryTimer) return;
    let running = false;
    state.brillDeliveryTimer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const { sendBookingNotifications } =
          await import("@/services/notifications");
        const { publishShootingLogs } = await import("@/services/shooting-log");
        await sendBookingNotifications();
        await publishShootingLogs();
      } catch (error) {
        console.error("Delivery worker:", (error as Error).message);
      } finally {
        running = false;
      }
    }, 60000);
    state.brillDeliveryTimer.unref();
  }
}
