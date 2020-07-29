# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_is_zero



class PosSession(models.Model):
    _inherit = 'pos.session'

    def _create_account_move(self):
        super(PosSession, self)._create_account_move()
        if self.config_id.account_analytic_id:
            for line in self.move_id.line_ids:
                if line.account_id.user_type_id.name == 'Income':
                    line.analytic_account_id = self.config_id.account_analytic_id