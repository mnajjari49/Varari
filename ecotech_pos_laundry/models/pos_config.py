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

from odoo import fields, models, api


class PosConfig(models.Model):
    _inherit = "pos.config"

    last_days = fields.Char("Last Days")
    enable_order_screen = fields.Boolean("Order Screen")
    record_per_page = fields.Integer("Record Per Page")
    enable_partial_payment = fields.Boolean('Enable Partial Payment')
    partial_payment_income_account = fields.Many2one('account.account', string="Partial Payment Income Account")
    prod_for_payment = fields.Many2one('product.product', string='Paid Amount Product',
                                       help="This is a dummy product used when a customer pays partially. This is a workaround to the fact that Odoo needs to have at least one product on the order to validate the transaction.")
    #previous order
    enable_customer_previous=fields.Boolean("Enable Customer Previous order")
    previous_product = fields.Many2one("product.product")

    #Membership Fields
    enable_membership_card = fields.Boolean('Enable Membership Card')
    enable_customer_adjustment = fields.Boolean('Enable Customer Adjustment')
    membership_card_product_id = fields.Many2one('product.product', string="Membership Card Product")
    default_delivery_state = fields.Many2one('pos.order.delivery.state', string="Default Delivery State")
    enable_journal_id = fields.Many2one("pos.payment.method", string="Enable Journal")
    adjustment_product = fields.Many2one("product.product", string="Adjustment Product")
    manual_card_number = fields.Boolean('Manual Card No.')
    default_exp_date = fields.Integer('Default Card Expire Months')
    msg_before_card_pay = fields.Boolean('Confirm Message Before Card Payment')
    membership_amount = fields.Many2many('membership.amount', string="Membership Card Amount")
    enable_pos_report_days = fields.Boolean('POS Report Days')
    overdue_order_days = fields.Integer('Set Overdue Orders Days')
    late_pickup_order_days = fields.Integer('Set Late for Pickup Days.')
    
    free_rack_from_order = fields.Many2one('pos.order.delivery.state', string="Free Rack From Order State")
    jr_for_adjustment = fields.Many2one('pos.payment.method',string="Adjustment Payment Method")
    acc_for_adjustment = fields.Many2one('account.account',string="Adjustment Account")
    default_customer_credit_limit = fields.Integer(string="Customer Credit Limit")
    offer_account = fields.Many2one("account.account")
    offer_product = fields.Many2one("product.product")

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    allow_for_membership_card = fields.Boolean(string = "Allow For Membership Card")
    allow_for_adjustment = fields.Boolean(string = "Allow For Customer Adjustment")
    pos_payment_ref = fields.Boolean('Recored Payment Ref', default=False)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
