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


#Todo:change to journal entry and make short cut in partners
class Membershipwizard(models.TransientModel):
    _name = 'membership.wizard'
    _description = 'Wizard Of MembershipCard'

    customer = fields.Many2one("res.partner")
    card_number=fields.Char()
    expire_date=fields.Date()
    card_value=fields.Many2one('membership.amount')
    promotion = fields.Float("Offer",related="card_value.promotion")
    card_type=fields.Many2one("membership.card.type")
    config_id=fields.Many2one("pos.config")
    journal_id = fields.Many2one("account.journal")
    manual_card_number=fields.Boolean(related="config_id.manual_card_number")
    recharge = fields.Boolean()
    amount = fields.Float()
    card_id=fields.Many2one('membership.card')

    @api.onchange("config_id","customer")
    def setParams(self):
        res={}
        if self.config_id:
            if self.config_id.default_exp_date:
                self.expire_date = datetime.now() + relativedelta(months=self.config_id.default_exp_date)
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
                #self.expire_date=False
                self.card_type=False
                self.recharge=False
                self.card_id=False
        if not self.manual_card_number and not self.card_number and not self.recharge:
            self.card_number = int(time.time())

    def action_done(self):
        '''Create the membership or if it recharge do a recharge and make the Entry associate with it '''
        analytic_account_id = self.config_id.account_analytic_id.id
        customer_adjustment_account = self.journal_id.default_credit_account_id.id
        customer_receivable_account = self.customer.property_account_receivable_id.id

        if self.config_id:
            if not self.recharge:
                self.env['membership.card'].create({
                    "card_no":self.card_number,
                    "card_value":self.card_value.name + self.promotion,
                    "expire_date":self.expire_date,
                    "customer_id":self.customer.id,
                    "card_type":self.card_type.id,

                })
            move_id = self.env["account.move"].create({
                'journal_id': self.journal_id.id,
                'ref': "Customer Membership "
            })

            self.amount = self.card_value.name + self.promotion
            if self.card_value.name > 0 and not self.promotion:
                adjustment_vals = [
                    {'debit': self.amount, 'credit': 0.0, 'name': 'membership', 'partner_id': self.customer.id,
                     'move_id': move_id.id, 'account_id': customer_adjustment_account,}]
                customer_vals = [
                    {'debit': 0.0, 'credit': self.amount, 'name': 'membership', 'partner_id': self.customer.id,
                     'move_id': move_id.id, 'account_id': customer_receivable_account, }]  # 'analytic_account_id': 16}]
                self.env['account.move.line'].with_context(check_move_validity=False).create(customer_vals)
                self.env['account.move.line'].with_context(check_move_validity=False).create(adjustment_vals)
            elif self.card_value.name > 0 and  self.promotion :
                adjustment_vals = [
                    {'debit': self.amount - self.promotion, 'credit': 0.0, 'name': 'membership',
                     'partner_id': self.customer.id,
                     'move_id': move_id.id, 'account_id': customer_adjustment_account, }]  # 'analytic_account_id': 16}]adjustment_vals = [
                offer_vals =   [{'debit': self.promotion, 'credit': 0.0, 'name': 'membership offer', 'partner_id': self.customer.id,
                     'move_id': move_id.id, 'account_id': self.config_id.offer_account.id,   'analytic_account_id': analytic_account_id}]
                customer_vals = [
                    {'debit': 0.0, 'credit': self.amount, 'name': 'membership', 'partner_id': self.customer.id,
                     'move_id': move_id.id, 'account_id': customer_receivable_account, }]  # 'analytic_account_id': 16}]
                self.env['account.move.line'].with_context(check_move_validity=False).create(customer_vals)
                self.env['account.move.line'].with_context(check_move_validity=False).create(adjustment_vals)
                self.env['account.move.line'].with_context(check_move_validity=False).create(offer_vals)
            else:raise UserError("Can not do Negative number")


            move_id.post()
        if self.recharge:
            recharge_vals = {
                'user_id': self.env.user.id,
                'recharge_date': fields.Date().today(),
                'customer_id': self.customer.id,
                'card_id': self.card_id.id,
                'amount': self.amount,
            }
            recharge_membership = self.env['membership.card.recharge'].create(recharge_vals)
            if recharge_membership:
                recharge_membership.card_id.write(
                    {'card_value': self.card_id.card_value + recharge_membership.amount})


class AdjustmentWizard(models.TransientModel):
    _name = 'adjustment.wizard'
    _description = 'Wizard Of Adjustment'

    customer = fields.Many2one("res.partner")
    amount=fields.Float()
    reason=fields.Many2one("adjustment.reason")
    config_id=fields.Many2one("pos.config")
    journal_id = fields.Many2one("account.journal")

    def action_done(self):
        move_id=self.env["account.move"].create({
            'journal_id':self.journal_id.id,
            'ref':"Customer Adjustment "
        })
        customer_adjustment_account = self.config_id.acc_for_adjustment.id
        customer_receivable_account = self.customer.property_account_receivable_id.id
        analytic_account_id = self.config_id.account_analytic_id.id
        if self.amount > 0:
             adjustment_vals= [{'debit': self.amount, 'credit': 0.0, 'name': 'Customer Adjustment', 'partner_id':self.customer.id, 'move_id': move_id.id, 'account_id': customer_adjustment_account,'analytic_account_id': analytic_account_id}]
             customer_vals= [{'debit': 0.0, 'credit': self.amount, 'name': 'Customer Adjustment', 'partner_id':self.customer.id, 'move_id': move_id.id, 'account_id': customer_receivable_account}]
        else:
            adjustment_vals = [
                {'debit': 0.0, 'credit':  self.amount, 'name': 'Customer Adjustment', 'partner_id': self.customer.id,
                 'move_id': move_id.id, 'account_id': customer_adjustment_account, 'analytic_account_id': analytic_account_id}]
            customer_vals = [
                {'debit':  self.amount, 'credit':0.0, 'name': 'Customer Adjustment', 'partner_id': self.customer.id,
                 'move_id': move_id.id, 'account_id': customer_receivable_account, }]  # 'analytic_account_id': 16}]

        self.env['account.move.line'].with_context(check_move_validity=False).create(customer_vals)
        self.env['account.move.line'].with_context(check_move_validity=False).create(adjustment_vals)
        move_id.post()
        self.env["customer.adjustment"].create(
            {
                "partner_id":self.customer.id,
                "reason_id":self.reason.id,
                "amount":self.amount,
                "move_id":move_id.id,
                "adjustment_date":fields.Date.today()
            }
        )



# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
