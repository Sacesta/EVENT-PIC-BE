const cron =   require("node-cron")
const Event =   require("../models/Event.js") // Adjust path
const emailService = require("./emailService.js") // Adjust path

/**
 * Helper function to check if a date is today (ignoring time)
 */
function isToday(date) {
  const today = new Date();
  const target = new Date(date);
  return (
    today.getFullYear() === target.getFullYear() &&
    today.getMonth() === target.getMonth() &&
    today.getDate() === target.getDate()
  );
}

/**
 * CRON job: Runs every day at 8 AM
 */
cron.schedule("0 8 * * *", async () => {
  console.log("🔔 Running daily event start notification job...");

  try {
    // Get all events whose startDate is today
    const events = await Event.find({
      startDate: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    })
      .populate("producerId", "email name")
      .populate("supplierId", "email name");

    if (!events.length) {
      console.log("No events starting today.");
      return;
    }

    for (const event of events) {
      const { eventName, producerId, supplierId, startDate } = event;

      const subject = `Event "${eventName}" starts today!`;
      const message = `
        Hello,

        This is a reminder that your event "${eventName}" is starting today (${new Date(startDate).toLocaleDateString()}).

        Please ensure all preparations are complete.

        Best regards,
        Event Management Team
      `;

      // Send email to producer
      if (producerId?.email) {
        await emailService.sendMail({
          to: producerId.email,
          subject,
          text: message,
        });
      }

      // Send email to supplier
      if (supplierId?.email) {
        await emailService.sendMail({
          to: supplierId.email,
          subject,
          text: message,
        });
      }

      console.log(`✅ Notification sent for event: ${eventName}`);
    }
  } catch (err) {
    console.error("❌ Error running event notification job:", err);
  }
});
