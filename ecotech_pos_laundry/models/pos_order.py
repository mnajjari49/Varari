# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################
import logging
from datetime import datetime, timedelta
from odoo.tools import float_is_zero
import psycopg2
from odoo import fields, models, api, tools, _
from pytz import timezone


_logger = logging.getLogger(__name__)

class productTemp(models.Model):

    _inherit = 'product.template'

    arabic_name = fields.Char(
        string='Arabic Name',
        required=False)
    label_count = fields.Integer(default=1,string="No of pieces")


class productProd(models.Model):
    _inherit = 'product.product'

    arabic_name = fields.Char(
        string='Arabic Name',related="product_tmpl_id.arabic_name",
        store=True)

class PosOrder(models.Model):
    _inherit = "pos.order"

    promise_date = fields.Datetime(string="Promise Date")
    order_rack_id = fields.Many2many('pos.order.rack', string="Rack")
    delivery_state_id = fields.Many2one('pos.order.delivery.state', string="Delivery State")
    delivery_state_Short_code = fields.Char(related="delivery_state_id.short_code")
    partner_phone = fields.Char(related="partner_id.phone", store=True, string="Customer Phone")
    partner_mobile = fields.Char(related="partner_id.mobile", store=True, string="Customer Mobile")

    # Memebership Order
    is_membership_order = fields.Boolean(string = "Membership Order")
    is_previous_order = fields.Boolean(string = "Previous Order")
    is_adjustment = fields.Boolean(string = "Customer Adjustment Order")

    # Fields Taken for the Partial Payment
    amount_due = fields.Float(string='Amount Due', compute='_compute_amount_due')
    draft_order = fields.Boolean(string="Draft Order")
    partial_paid_order = fields.Boolean(string="Partial Paid")
    old_session_ids = fields.Many2many('pos.session', string="Old sessions")
    current_session=   fields.Many2one('pos.session')
    membership_offer=fields.Float("offer")

    def _compute_amount_due(self):
        for each in self:
            each.amount_due = each.amount_total - each.amount_paid

    def write(self, vals):
        for order in self:
            if order.name == '/':
                vals['name'] = order.config_id.sequence_id._next()
        return super(PosOrder, self).write(vals)

    @api.model
    def _order_fields(self, ui_order):
        res = super(PosOrder, self)._order_fields(ui_order)
        res.update({
            'promise_date': ui_order['promise_date'].replace('T', ' ')[:19] or False,
            'partial_paid_order': ui_order.get('is_partial_paid'),
            'draft_order': ui_order.get('draft_order'),
            'delivery_state_id': ui_order.get('delivery_state_id') or False,
            'is_membership_order': ui_order.get('is_membership_order'),
            'is_previous_order': ui_order.get('is_previous_order'),
            'is_adjustment' : ui_order.get('is_adjustment') or False,
            'membership_offer':ui_order.get('membership_offer') or False,
        })
        return res

    @api.model
    def _payment_fields(self, order, ui_paymentline):
        res = super(PosOrder, self)._payment_fields(order, ui_paymentline)
        payment_date = ui_paymentline['name']
        payment_date = fields.Date.context_today(self, fields.Datetime.from_string(payment_date))
        res.update({
            'note': ui_paymentline.get('note') or "",
            'amount': ui_paymentline['amount'] or 0.0,
            'payment_date': payment_date,
            'payment_method_id': ui_paymentline['payment_method_id'],
            'card_type': ui_paymentline.get('card_type'),
            'transaction_id': ui_paymentline.get('transaction_id'),
            'pos_order_id': order.id,
            'payment_ref': ui_paymentline.get('payment_ref'),
        })
        return res

    def _compute_amount_due(self):
        for each in self:
            each.amount_due = each.amount_total - each.amount_paid

    def write(self, vals):
        for order in self:
            if order.name == '/':
                vals['name'] = order.config_id.sequence_id._next()
        return super(PosOrder, self).write(vals)

    def add_payment(self, data):
        """Create a new payment for the order"""

        if not data.get('session_id'):
            order=self.browse(data.get('pos_order_id'))
            data['session_id']=order.session_id.id
        return super(PosOrder, self).add_payment(data)

    def _process_order(self, order, draft, existing_order):
        pos_line_obj = self.env['pos.order.line']
        old_order_id = order.get('data').get('old_order_id')
        draft_order_id = order.get('data').get('old_order_id')
        if order.get('data').get('old_order_id'):
            # order_id = old_order_id
            order_obj = self.browse([int(old_order_id)])
            # existing_order = order_obj
            if order.get('data').get('old_order_id'):
                if not draft_order_id:
                    # order.get('data').pop('draft_order')
                    order_id = self.create(self._order_fields(order))
                    return order_id
                else:
                    order_id = draft_order_id
                    pos_line_ids = pos_line_obj.search([('order_id', '=', order_id)])
                    if order_obj.lines and len(order.get('data').get('statement_ids')) == 0:
                        pos_line_ids.unlink()
                        order_obj.write({'lines': order['data']['lines']})
                        order_obj.write({'amount_due': order.get('data').get('amount_due'),
                                         'amount_total': order.get('data').get('amount_total'),
                                         'partner_id': order.get('data').get('partner_id'),
                                         'amount_paid': order.get('data').get('amount_paid')})
            currency = order_obj.currency_id
            for payments in order.get('data').get('statement_ids'):
                if not float_is_zero(payments[2].get('amount'), precision_rounding=currency.rounding):
                    order_obj.add_payment({
                        'pos_order_id': order_obj.id,
                        'session_id': order_obj.current_session.id,
                        'payment_date': fields.Datetime.now(),
                        'amount': currency.round(payments[2].get('amount')) if currency else payments[2].get('amount'),
                        'payment_method_id': payments[2].get('payment_method_id'),
                        'payment_ref': payments[2].get('payment_ref'),

                    })
                    if not order_obj.amount_due:
                        order_obj.action_pos_order_paid()
            session = self.env['pos.session'].browse(order['data']['pos_session_id'])
            if session.sequence_number <= order.get('data').get('sequence_number'):
                session.write({'sequence_number': order.get('data').get('sequence_number') + 1})
                session.refresh()
            if (order.get('data').get('partner_id')):
                partner_obj = self.env['res.partner'].search([('id', '=', order.get('data').get('partner_id'))])
                partner_obj.write({'last_visit_date': datetime.today()})

            if not float_is_zero(order.get('data').get('amount_return'), self.env['decimal.precision'].precision_get('Account')):
                cash_journal_ids = session.config_id.payment_method_ids.filtered(lambda pm: pm.is_cash_count == True)
                if not len(cash_journal_ids):
                    raise Warning(_('error!'),
                                         _("No cash Payment Method found for this session. Unable to record returned cash."))
                cash_journal = cash_journal_ids[0]
                order_obj.add_payment({
                    'pos_order_id': order_obj.id,
                    'session_id': order_obj.current_session.id,
                    'payment_date': fields.Datetime.now(),
                    'amount': currency.round(-order.get('data').get('amount_return')) if currency else -order.get('data').get('amount_return'),
                    'payment_method_id': cash_journal.id,
                })
                if not order_obj.amount_due:
                    order_obj.action_pos_order_paid()

        else:
            to_invoice = order['to_invoice'] if not draft else False
            order = order['data']
            pos_session = self.env['pos.session'].browse(order['pos_session_id'])
            if pos_session.state == 'closing_control' or pos_session.state == 'closed':
                order['pos_session_id'] = self._get_valid_session(order).id

            pos_order = False
            if not existing_order:
                pos_order = self.create(self._order_fields(order))
            else:
                pos_order = existing_order
                # pos_order.lines.unlink()
                order['user_id'] = pos_order.user_id.id
                pos_order.write(self._order_fields(order))
            self._process_payment_lines(order, pos_order, pos_session, draft)

            if not draft:
                try:
                    pos_order.action_pos_order_paid()
                except psycopg2.DatabaseError:
                    # do not hide transactional errors, the order(s) won't be saved!
                    raise
                except Exception as e:
                    _logger.error('Could not fully process the POS Order: %s', tools.ustr(e))

            if to_invoice:
                pos_order.action_pos_order_invoice()
                pos_order.account_move.sudo().with_context(force_company=self.env.user.company_id.id).post()
                # start code
            if order.get('partner_id'):
                partner_obj = self.env['res.partner'].search([('id', '=', order.get('partner_id'))])
                partner_obj.write({'last_visit_date': pos_order.date_order})
            # end code
            return pos_order.id

    @api.model
    def create_from_ui(self, orders, draft=False):
        # Keep only new orders
        res = super(PosOrder, self).create_from_ui(orders, draft=False)
        pos_orders = self.browse([each.get('id') for each in res])
        existing_orders = pos_orders.read(['pos_reference'])
        existing_references = set([o['pos_reference'] for o in existing_orders])
        orders_to_read = [o for o in orders if o['data']['name'] in existing_references]
        for tmp_order in orders_to_read:
            order = tmp_order['data']
            order_obj = self.search([('pos_reference', '=', order['name'])])
            # create adjustment
            if order.get('adjustment'):
                for adj in order.get('adjustment'):
                    adj_vals = {'partner_id': adj.get('partner_id'),
                                'reason_id' : adj.get('adjustment_reason'),
                                'amount' : adj.get('adjustment_amount'),
                                'adjustment_date' : adj.get('adjustment_date')}
                    adj_obj = self.env['customer.adjustment'].create(adj_vals)
                    if adj_obj:
                        membership_obj = self.env['membership.card'].search([('customer_id', '=', adj.get('partner_id'))])
                        if membership_obj:
                            membership_obj.write({'card_value': membership_obj.card_value + adj.get('adjustment_amount')})
            # create membership card record
            if order.get('membership_card'):
                for create_details in order.get('membership_card'):
                    vals = {
                        'card_no': create_details.get('membership_card_card_no'),
                        'card_value': create_details.get('membership_amount'),
                        'customer_id': create_details.get('membership_card_customer') or False,
                        'expire_date': create_details.get('membership_card_expire_date'),
                        'card_type': create_details.get('membership_card_type'),
                    }
                    self.env['membership.card'].create(vals)

            #  create redeem giftcard for use
            if order.get('redeem') and order_obj:
                for redeem_details in order.get('redeem'):
                    redeem_vals = {
                        'pos_order_id': order_obj.id,
                        'order_date': order_obj.date_order,
                        'customer_id': redeem_details.get('card_customer_id') or False,
                        'card_id': redeem_details.get('redeem_card_no'),
                        'amount': redeem_details.get('redeem_card_amount'),
                    }
                    use_giftcard = self.env['membership.card.use'].create(redeem_vals)
                    if use_giftcard and use_giftcard.card_id:
                        use_giftcard.card_id.write(
                            {'card_value': use_giftcard.card_id.card_value - use_giftcard.amount})

            # recharge giftcard
            if order.get('recharge'):
                for recharge_details in order.get('recharge'):
                    recharge_vals = {
                        'user_id': order_obj.user_id.id,
                        'recharge_date': order_obj.date_order,
                        'customer_id': recharge_details.get('card_customer_id') or False,
                        'card_id': recharge_details.get('recharge_card_id'),
                        'amount': recharge_details.get('recharge_card_amount'),
                    }
                    recharge_membership = self.env['membership.card.recharge'].create(recharge_vals)
                    if recharge_membership:
                        recharge_membership.card_id.write(
                            {'card_value': recharge_membership.card_id.card_value + recharge_membership.amount})
        return res

    @api.model
    def ac_pos_search_read(self, domain):
        domain = domain.get('domain')
        search_vals = self.search_read(domain)
        user_id = self.env['res.users'].browse(self._uid)
        tz = False
        if self._context and self._context.get('tz'):
            tz = timezone(self._context.get('tz'))
        elif user_id and user_id.tz:
            tz = timezone(user_id.tz)
        if tz:
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            today_sale = 0.0
            result = []
            for val in search_vals:
                if sign == '-':
                    val.update({
                        'date_order': (val.get('date_order') - timedelta(hours=hour_tz, minutes=min_tz)).strftime(
                            '%Y-%m-%d %H:%M:%S'),
                        'promise_date': (val.get('promise_date') - timedelta(hours=hour_tz, minutes=min_tz)).strftime(
                            '%Y-%m-%d %H:%M:%S')
                    })
                elif sign == '+':
                    val.update({
                        'date_order': (val.get('date_order') + timedelta(hours=hour_tz, minutes=min_tz)).strftime(
                            '%Y-%m-%d %H:%M:%S'),
                        'promise_date': (val.get('promise_date') + timedelta(hours=hour_tz, minutes=min_tz)).strftime(
                            '%Y-%m-%d %H:%M:%S')
                    })
                result.append(val)
            return result
        else:
            return search_vals

    def action_pos_order_done(self):
        return self._create_account_move_line()




class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    # @api.model
    # def create(self, values):
    #     if values.get('product_id'):
    #         if self.env['pos.order'].browse(values['order_id']).session_id.config_id.prod_for_payment.id == values.get(
    #                 'product_id'):
    #             return
    #     return super(PosOrderLine, self).create(values)


class AccountJournal(models.Model):
    _inherit = "account.journal"

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        if self._context.get('voucher'):
            if self._context.get('journal_ids') and \
                    self._context.get('journal_ids')[0] and \
                    self._context.get('journal_ids')[0][2]:
                args += [['id', 'in', self._context.get('journal_ids')[0][2]]]
            else:
                return False
        return super(AccountJournal, self).name_search(name, args=args, operator=operator, limit=limit)


class ResUser(models.Model):
    _inherit = 'res.users'

    allow_order_screen = fields.Boolean(string="Allow Order Screen")
    enable_adjustment = fields.Boolean(string="Allow Customer Adjustment")
    enable_pos_report = fields.Boolean(string="Allow POS Report")
    enable_membership_card = fields.Boolean(string="Allow Create Membership")
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
