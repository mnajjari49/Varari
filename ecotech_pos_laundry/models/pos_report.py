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

from odoo import fields, models


class PosOrderReport(models.Model):
    _inherit = 'report.pos.order'

    is_membership_order = fields.Boolean(related="order_id.is_membership_order", string="Membership Order")
    is_adjustment = fields.Boolean(related="order_id.is_adjustment", string="Customer Adjustment Order")
    old_session_ids = fields.Many2many(related="order_id.old_session_ids", string="Old sessions")

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
