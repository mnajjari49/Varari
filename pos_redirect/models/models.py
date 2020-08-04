#-*- coding: utf-8 -*-

from odoo import models, fields, api


class resUsers(models.Model):
    _inherit = 'res.users'

    automatic_pos  = fields.Boolean(
        string='Automatic Redirect',
        required=True)
    pos_config_id  = fields.Many2one(
        comodel_name='pos.config',
        string='Point Of Sale',
        required=False)