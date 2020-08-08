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
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = "pos.order"

    @api.model
    def _order_fields(self, ui_order):
        res = super(PosOrder, self)._order_fields(ui_order)
        res.update({
            'note_id': ui_order.get('note_id') or False,
        })
        return res

    note_id = fields.Many2many(
        comodel_name='pos.note.config',
        string='Note')

class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    note_id = fields.Many2many(
        comodel_name='pos.note.config',
        string='Note',
        required=False)

class posNote(models.Model):
    _name = 'pos.note.config'
    _description = 'Order/Line Note'

    name = fields.Char(
        string='Note',
        required=True)
    active = fields.Boolean(
        string='Active',
        default=True)