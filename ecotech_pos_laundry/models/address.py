
from odoo import models, fields, api

class addressGovernorate(models.Model):
    _name = 'address.governorate'
    _description = 'Address Governorate'

    name = fields.Char(
        string='Name',
        required=True)

class addressCity(models.Model):
    _name = 'address.city'
    _description = 'Address City'

    name = fields.Char(
        string='Name',
        required=True)

    governorate_id = fields.Many2one(
        comodel_name='address.governorate',
        string='Governorate',
        required=True)


class addressBlock(models.Model):
    _name = 'address.block'
    _description = 'Address City'

    name = fields.Char(
        string='Name',
        required=True)

    city_id = fields.Many2one(
        comodel_name='address.city',
        string='City',
        required=True)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
