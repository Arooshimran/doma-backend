// utils/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVendorApprovalEmail(vendor: { email: string, name?: string }) {
  try {
    await resend.emails.send({
      from: 'Doma <onboarding@resend.dev>', // domain must be verified in Resend
      to: vendor.email,
      subject: 'Vendor Approval Notification',
      html: `<p>Hi ${vendor.name || 'Vendor'},</p>
             <p>Your vendor account has been approved. You can now start listing your products!</p>
             <p>Best regards,<br/>Your Store Team</p>`,
    });
    console.log(`✅ Approval email sent to ${vendor.email}`);
  } catch (error) {
    console.error(`❌ Failed to send approval email to ${vendor.email}`, error);
  }
}

export async function sendVendorRejectionEmail(vendor: { email: string, name?: string }, reason?: string) {
  try {
    await resend.emails.send({
      from: 'Doma <onboarding@resend.dev>',
      to: vendor.email,
      subject: 'Vendor Application Rejected',
      html: `<p>Hi ${vendor.name || 'Vendor'},</p>
             <p>We’re sorry to inform you that your vendor application was rejected.</p>
             ${reason ? `<p>Reason: ${reason}</p>` : ''}
             <p>Best regards,<br/>Your Store Team</p>`,
    });
    console.log(`✅ Rejection email sent to ${vendor.email}`);
  } catch (error) {
    console.error(`❌ Failed to send rejection email to ${vendor.email}`, error);
  }
}
