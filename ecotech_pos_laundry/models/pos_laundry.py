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

class CustomerPreference(models.Model):
    _name = 'customer.preference'
    _description = 'Customer Preference'

    name = fields.Char(string="Name")
    description = fields.Char(string="Description")


class PosOrderDeliveryState(models.Model):
    _name = 'pos.order.delivery.state'
    _description = 'POS Order Delivery State'

    name = fields.Char(string="Name")
    short_code = fields.Char(string="Short Code")


class PosOrderRank(models.Model):
    _name = 'pos.order.rack'
    _description = 'POS Order Rack'

    name = fields.Char(string="Number")
    description = fields.Char(string="Description")
    config_id = fields.Many2one('pos.config', 'Rack Belongs To')
    status = fields.Boolean(string='Status', default=False)

    @api.model
    def update_rack_status(self, ids, old_ids):
        if old_ids:
            ids = list(set(ids + old_ids))
        rack_obj = self.search([('id', 'in', ids)])
        if old_ids:
            for each in rack_obj:
                if each.id in old_ids:
                    each.status = False
        for each in rack_obj:
            if each.id in ids:
                each.status = True

        return True

    @api.model
    def update_all_rack_status(self, ids):
        rack_obj = self.search([('id', 'in', ids)])
        for each in rack_obj:
            each.status = False
        return True


class AdjustmentReason(models.Model):
    _name = 'adjustment.reason'
    _description = 'Adjustment Reason'

    name = fields.Char("Adjustment Reason")


class CustomerAdjustment(models.Model):
    _name = 'customer.adjustment'
    _description = 'Customer Adjustment'

    partner_id = fields.Many2one("res.partner", string="Partner")
    reason_id = fields.Many2one("adjustment.reason", string="Adjustment Reason")
    amount = fields.Float(string="Amount")
    adjustment_date = fields.Date(string="Adjustment Date")
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
