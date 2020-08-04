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
class PosOrder(models.Model):
    _inherit = "pos.order"

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
    def _payment_fields(self, order, ui_paymentline):
        payment_date = ui_paymentline['name']
        payment_date = fields.Date.context_today(self, fields.Datetime.from_string(payment_date))
        return {
            'amount': ui_paymentline['amount'] or 0.0,
            'payment_date': payment_date,
            'payment_method_id': ui_paymentline['payment_method_id'],
            'card_type': ui_paymentline.get('card_type'),
            'transaction_id': ui_paymentline.get('transaction_id'),
            'pos_order_id': order.id,
            'payment_ref': ui_paymentline.get('payment_ref'),
        }


