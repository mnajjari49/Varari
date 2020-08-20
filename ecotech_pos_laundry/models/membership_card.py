# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
# You should have received a copy of the License along with this program.
#################################################################################

import logging
from odoo import models, fields, api, _
from datetime import datetime, timedelta
from odoo.exceptions import ValidationError
import time
import time
from dateutil.relativedelta import relativedelta


_logger = logging.getLogger(__name__)


class MembershipCard(models.Model):
    _name = 'membership.card'
    _rec_name = 'card_no'
    _description = 'Membership Cards'
    _order = 'id desc'

    @api.model
    def _send_mail_balance_and_expired_coupon(self, expired=False, balance=False):
        mail_obj = self.env['mail.mail']
        today = fields.Date.today()
        this_week_end_date = fields.Date.to_string(fields.Date.from_string(today) + datetime.timedelta(days=7))
        gift_card_ids = self.search([('expire_date', '=', this_week_end_date)])
        template_id = self.env['ir.model.data'].get_object_reference('ecotech_pos_laundry',
                                                                     'email_template_for_coupon_expire_7')
        balance_template_id = self.env['ir.model.data'].get_object_reference('ecotech_pos_laundry',
                                                                             'email_template_regarding_balance')
        if expired:
            for gift_card in gift_card_ids:
                if template_id and template_id[1]:
                    try:
                        template_obj1 = self.env['mail.template'].browse(template_id[1])
                        template_obj1.send_mail(gift_card.id, force_send=True, raise_exception=True)
                    except Exception as e:
                        _logger.error('Unable to send email for order %s', e)
        if balance:
            for gift_card in self.search([]):
                if balance_template_id and balance_template_id[1]:
                    try:
                        template_obj2 = self.env['mail.template'].browse(balance_template_id[1])
                        template_obj2.send_mail(gift_card.id, force_send=True, raise_exception=True)
                    except Exception as e:
                        _logger.error('Unable to send email for order %s', e)

    def random_cardno(self):
        return int(time.time())

    card_no = fields.Char(string="Card No", default=random_cardno,  )
    card_value = fields.Float(string="Card Value")
    card_type = fields.Many2one('membership.card.type', string="Card Type")
    customer_id = fields.Many2one('res.partner', string="Customer")
    issue_date = fields.Date(string="Issue Date", default=fields.Date.today())
    expire_date = fields.Date(string="Expire Date")
    is_active = fields.Boolean('Active', default=True)
    used_line = fields.One2many('membership.card.use', 'card_id', string="Used Line")
    recharge_line = fields.One2many('membership.card.recharge', 'card_id', string="Recharge Line")

    def write(self, vals):
        mail_obj = self.env['mail.mail']
        res = super(MembershipCard, self).write(vals)
        if vals.get('card_no'):
            try:
                template_id = self.env['ir.model.data'].get_object_reference('ecotech_pos_laundry',
                                                                             'email_template_exchange_number')
                if template_id and template_id[1]:
                    template_obj = self.env['mail.template'].browse(template_id[1])
                    template_obj.send_mail(self.id, force_send=True, raise_exception=True)
            except Exception as e:
                _logger.error('Unable to send email for mail %s', e)
        return res


class MembershipCardUse(models.Model):
    _name = 'membership.card.use'
    _rec_name = 'pos_order_id'
    _description = 'Membership Card Use'
    _order = 'id desc'

    card_id = fields.Many2one('membership.card', string="Card", readonly=True)
    customer_id = fields.Many2one('res.partner', string="Customer")
    pos_order_id = fields.Many2one("pos.order", string="Order")
    order_date = fields.Date(string="Order Date")
    amount = fields.Float(string="Amount")

    @api.model
    def create(self, vals):
        res = super(MembershipCardUse, self).create(vals)
        mail_obj = self.env['mail.mail']
        if res.pos_order_id:
            try:
                template_id = self.env['ir.model.data'].get_object_reference('ecotech_pos_laundry',
                                                                             'email_template_regarding_card_use')
                if template_id and template_id[1]:
                    template_obj = self.env['mail.template'].browse(template_id[1])
                    template_obj.send_mail(res.id, force_send=True, raise_exception=True)
            except Exception as e:
                _logger.error('Unable to send email for order %s', e)
        return res


class MembershipCardRecharge(models.Model):
    _name = 'membership.card.recharge'
    _rec_name = 'amount'
    _description = 'Recharge Membership card'
    _order = 'id desc'

    card_id = fields.Many2one('membership.card', string="Card", readonly=True)
    customer_id = fields.Many2one('res.partner', string="Customer")
    recharge_date = fields.Date(string="Recharge Date")
    user_id = fields.Many2one('res.users', string="User")
    amount = fields.Float(string="amount")


class MembershipCardType(models.Model):
    _name = 'membership.card.type'
    _rec_name = 'name'
    _description = 'Types of Membership card'

    name = fields.Char(string="Name")
    code = fields.Char(string=" Code")


class MembershipAmount(models.Model):
    _name = 'membership.amount'
    _description = 'Amount Of MembershipCard'

    name = fields.Float(string = "Amount")
    promotion = fields.Float("Offer")


class Membershipwizard(models.TransientModel):
    _name = 'membership.wizard'
    _description = 'Wizard Of MembershipCard'

    customer = fields.Many2one("res.partner")
    card_number=fields.Char()
    expire_date=fields.Date()
    card_value=fields.Many2one('membership.amount')
    promotion = fields.Float("Offer",related="card_value.promotion")
    card_type=fields.Many2one("membership.card.type")
    session_id=fields.Many2one("pos.session",domain=[("state","!=","closed")])
    manual_card_number=fields.Boolean(related="session_id.config_id.manual_card_number")
    recharge = fields.Boolean()
    amount = fields.Float()
    card_id=fields.Many2one('membership.card')

    @api.onchange("session_id","customer")
    def setParams(self):
        res={}
        if self.session_id:
            if self.session_id.config_id.default_exp_date:
                self.expire_date = datetime.now() + relativedelta(months=self.session_id.config_id.default_exp_date)
        if self.customer:
            res=self.env["membership.card"].search([("customer_id","=",self.customer.id)],limit=1)
            if res:
                self.card_number=res.card_no
                self.expire_date=res.expire_date
                self.card_type=res.card_type
                self.card_id=res
                self.recharge=True
            else:
                self.card_number=False
                self.expire_date=False
                self.card_type=False
                self.recharge=False
                self.card_id=False
        if not self.manual_card_number and not self.card_number and not self.recharge:
            self.card_number = int(time.time())

    def action_done(self):
        membership_product_id=self.session_id.config_id.membership_card_product_id.id
        creation_date=str(fields.Datetime().now())
        orderName="[Order] "+str(int(time.time()))
        create_from_ui={'id': "membershipUi",
         'data':
             {'name': orderName,

              'amount_paid': 0,
              'amount_total': self.card_value.name,
              'amount_tax': 0, 'amount_return': 0,
              'pos_reference':orderName,
              'sequence_number':0,
              'lines': [[0, 0,
                         {'qty': 1, 'price_unit':self.card_value.name, 'price_subtotal': self.card_value.name, 'price_subtotal_incl': self.card_value.name, 'discount': 0,
                          'product_id': membership_product_id,
                          'tax_ids': [[6, False, []]], 'id': 2, 'pack_lot_ids': []}]],
              'statement_ids': [],
        'pos_session_id': self.session_id.id, 'pricelist_id':  self.session_id.config_id.pricelist_id.id, 'partner_id': self.customer.id, 'user_id': self.env.user.id, 'employee_id': None,
        # 'uid': 7300442582, 'sequence_number': 5,
              'creation_date': creation_date,
        'fiscal_position_id': False, 'server_id': False, 'to_invoice': False, 'draft_order': False, 'amount_due': self.card_value.name,
              'promise_date': '2020-08-14T06:34:02.000Z',
        'is_membership_order': True if not self.recharge else False,
        'recharge': [] if  not self.recharge else[ {
            'card_customer_id': self.customer.id,
            'recharge_card_id': self.card_id.id,
            'recharge_card_amount': self.card_value.name

        }],

        'membership_card': [{'membership_card_card_no': self.card_number,
                             'membership_card_customer':self.customer.id,
                             'membership_card_expire_date': self.expire_date,
                             'membership_amount': self.card_value.name if not self.promotion else self.card_value.name+self.promotion,
                             'membership_card_customer_name': self.customer.name,
                             'membership_card_type': self.card_type.id}] if not self.recharge else [],
        'redeem': [],
        'is_partial_paid': False,
        'is_adjustment': False, 'is_previous_order': False, 'membership_offer':self.promotion,
        'delivery_state_id': 3, 'order_rack_id': [], 'adjustment': [],  },
        'to_invoice': False}
        order=self.env["pos.order"]
        res=order.create_from_ui([create_from_ui])
        res_id=self.env.ref("point_of_sale.view_pos_pos_form").id
        return  {
                    'name': 'Pos Orders',
                    'view_type': 'form',
                    'view_mode': 'form',
                    'view_id': [res_id],
                    'res_model': 'pos.order',
                    'type': 'ir.actions.act_window',
                    'nodestroy': True,
                    'target': 'current',
                    'res_id': res[0]["id"],
                   }



# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
