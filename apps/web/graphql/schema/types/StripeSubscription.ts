import { SubscriptionPlan } from '@prisma/client';
import { arg, enumType, inputObjectType, intArg, mutationField, objectType, queryField, stringArg } from 'nexus';
import Stripe from 'stripe';
import { secondsToDate } from 'shared-server';
import { requireProjectAccess } from './permissions';


export const InvoiceStatus = enumType({
  name: 'InvoiceStatus',
  members: [
    'DELETED',
    'DRAFT',
    'OPEN',
    'PAID',
    'UNCOLLECTIBLE',
    'VOID',
  ]
})

export const InvoiceBillingReason = enumType({
  name: 'InvoiceBillingReason',
  members: [
    'AUTOMATIC_PENDING_INVOICE_ITEM_INVOICE',
    'MANUAL',
    'QUOTE_ACCEPT',
    'SUBSCRIPTION',
    'SUBSCRIPTION_CREATE',
    'SUBSCRIPTION_CYCLE',
    'SUBSCRIPTION_THRESHOLD',
    'SUBSCRIPTION_UPDATE',
    'UPCOMING',
  ]
})

export const StripeInvoice = objectType({
  name: 'StripeInvoice',
  definition(t) {
    t.model.id();
    t.model.created();
    t.model.dueDate();
    t.model.status();
    t.model.amountDue();
    t.model.amountPaid();
    t.model.amountRemaining();
    t.model.billingReason();
    t.model.invoicePdf();
    t.model.periodStart();
    t.model.periodEnd();
    t.model.receiptNumber();
    t.model.subtotal();
    t.model.tax();
    t.model.total();
  }
})

const formatStripeInvoice = (s: Stripe.Invoice) => ({
  id: 'unset',
  created: secondsToDate(s.created),
  dueDate: s.due_date && secondsToDate(s.due_date),
  status: s.status.toUpperCase() as any,
  amountDue: s.amount_due,
  amountPaid: s.amount_paid,
  amountRemaining: s.amount_remaining,
  billingReason: s.billing_reason as any,
  invoicePdf: s.invoice_pdf,
  periodStart: secondsToDate(s.period_start),
  periodEnd: secondsToDate(s.period_end),
  receiptNumber: s.receipt_number,
  subtotal: s.subtotal,
  tax: s.tax,
  total: s.total,
  projectId: 'unset',
})

export const StripeSubscriptionStatus = enumType({
  name: 'StripeSubscriptionStatus',
  members: [
    'INCOMPLETE',
    'INCOMPLETE_EXPIRED',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'UNPAID',
  ]
})

export const StripeSubscription = objectType({
  name: 'StripeSubscription',
  definition(t) {
    t.model.id();
    t.model.metadata();
    t.model.status();
    t.model.stripePriceId();
    t.model.quantity();
    t.model.cancelAtPeriodEnd();
    t.model.cancelAt();
    t.model.canceledAt();
    t.model.currentPeriodStart();
    t.model.currentPeriodEnd();
    t.model.created();
    t.model.endedAt();
  }
})

export const UpsertSubscriptionInput = inputObjectType({
  name: 'UpsertStripeSubscriptionInput',
  definition(t) {
    t.string('projectId', { required: true });
    t.string('priceId', { required: true });
  }
})

export const upsertStripeSubscription = mutationField('upsertStripeSubscription', {
  type: StripeSubscription,
  args: {
    input: arg({ type: UpsertSubscriptionInput, required: true }),
  },
  authorize: requireProjectAccess({ role: 'ADMIN', projectIdFn: (_, args) => args.input.projectId }),
  async resolve(root, { input }, ctx) {

    const { projectId, priceId } = input;

    const project = await ctx.prisma.project.findUnique({
      where: { id: projectId },
      select: { stripeCustomerId: true },
    });

    const subscriptions = await ctx.prisma.stripeSubscription.findMany({
      where: { projectId },
    });

    const quantity = await ctx.prisma.userProject.count({
      where: { projectId },
    });
    
    
    
    if (subscriptions.length != 0) {
      const currentPriceType = subscriptions[0].subscriptionPlan;
      const price = await ctx.prisma.stripePrice.findUnique({ where: { id: priceId } });
      if (!price) {
        throw new Error('Price do not exists!');
      }

      const planOrder: SubscriptionPlan[] = ['FREE', 'BASIC', 'PREMIUM'];
      const currentPlanIndex = planOrder.indexOf(currentPriceType);
      const planIndex = planOrder.indexOf(price.type as any);
      const beginAtNextPeriod = planIndex <= currentPlanIndex;

      return ctx.getStripeHandler().updateSubscription(subscriptions[0].id, priceId, quantity, beginAtNextPeriod);
    }

    return ctx.getStripeHandler().createSubscription(project.stripeCustomerId, priceId, quantity);
  }
})