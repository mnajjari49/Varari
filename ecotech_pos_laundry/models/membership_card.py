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

    card_no = fields.Char(string="Card No", default=random_cardno, readonly=True)
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
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
