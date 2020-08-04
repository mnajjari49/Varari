# -*- coding: utf-8 -*-
from odoo import fields, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    payment_ref = fields.Char('Payment Reference')

class PosPayment(models.Model):
    _inherit = 'pos.payment.method'

    pos_payment_ref = fields.Boolean('Recored Payment Ref', default=False)
