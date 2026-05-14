// Email notification placeholder
// To activate: npm install nodemailer (or resend/sendgrid), set EMAIL_SERVER + EMAIL_FROM in .env

export const EMAIL_ENABLED = false;

interface OrderEmailParams {
  to: string;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  orderType: string;
  estimatedTime: number;
  trackingUrl: string;
}

export async function sendOrderConfirmationEmail(params: OrderEmailParams) {
  if (!EMAIL_ENABLED) {
    console.log("[Email Placeholder] Would send order confirmation to:", params.to, "Order:", params.orderNumber);
    return { success: true };
  }
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({ from: process.env.EMAIL_FROM, to: params.to, subject: `Order Confirmed - ${params.orderNumber}`, html: generateOrderEmailHtml(params) });
}

export async function sendNewOrderNotificationEmail(params: {
  restaurantEmail: string;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  total: number;
  dashboardUrl: string;
}) {
  if (!EMAIL_ENABLED) {
    console.log("[Email Placeholder] Would notify restaurant:", params.restaurantEmail, "of new order:", params.orderNumber);
    return { success: true };
  }
}

export async function sendOrderStatusUpdateEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  estimatedReady?: Date;
  rejectionReason?: string;
}) {
  if (!EMAIL_ENABLED) {
    console.log("[Email Placeholder] Would send status update to:", params.to, "Status:", params.status);
    return { success: true };
  }
}

export async function sendTrialExpiringEmail(params: {
  to: string;
  restaurantName: string;
  daysLeft: number;
  upgradeUrl: string;
}) {
  if (!EMAIL_ENABLED) {
    console.log("[Email Placeholder] Would send trial expiring email to:", params.to);
    return { success: true };
  }
}
