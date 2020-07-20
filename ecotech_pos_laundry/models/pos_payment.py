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


class PosPayment(models.Model):
    _inherit = "pos.payment"

    old_session_id = fields.Many2one('pos.session', string = 'Old session Id')

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
