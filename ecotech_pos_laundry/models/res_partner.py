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

from odoo import models, fields, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.depends('used_ids', 'recharged_ids')
    def compute_amount(self):
        total_amount = 0
        for ids in self:
            for card_id in ids.card_ids:
                total_amount += card_id.card_value
            ids.remaining_amount = total_amount

    def _compute_remain_credit_limit(self):
        for partner in self:
            total_credited = 0
            orders = self.env['pos.order'].search([('partner_id', '=', partner.id),
                                                   ('state', '=', 'draft')])
            for order in orders:
                total_credited += order.amount_due
            partner.remaining_credit_limit = partner.credit_limit - total_credited


    @api.depends('name', 'phone')
    def name_get(self):
        result = []
        for record in self:
            name =  record.name
            if record.phone:
                name +=" - " +record.mobile
            result.append((record.id, name))
        return result

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args or []
        recs = self.browse()
        if name:
            recs = self.search(["|",('phone', 'ilike', name),("name","ilike",name)] + args, limit=limit)
        if not recs:
            recs = self.search([('name', operator, name)] + args, limit=limit)
        return recs.name_get()
    def getRemainMembership(self):
        for rec in self:
            card=self.env["membership.card"].search([("customer_id","=",rec.id)])
            if card:
                self.remain_membership=card.card_value
            else:self.remain_membership=0

    remain_membership=fields.Float(compute="getRemainMembership")

    card_ids = fields.One2many('membership.card', 'customer_id', string="List of card")
    used_ids = fields.One2many('membership.card.use', 'customer_id', string="List of used card")
    recharged_ids = fields.One2many('membership.card.recharge', 'customer_id', string="List of recharged card")
    remaining_amount = fields.Char(compute=compute_amount, string="Remaining Amount", readonly=True)

    remaining_credit_limit = fields.Float("Remaining Credit Limit", compute="_compute_remain_credit_limit")

    date_of_birth = fields.Date(string="Date Of Birth")
    civil_id = fields.Char(String="Civil ID")
    last_visit_date = fields.Date(string="Last Visit Date")
    customer_preference_ids = fields.Many2many('customer.preference', string="Customer Preference")

    #Address
    @api.onchange('governorate_id')
    def onchange_governorate_id(self):
        self.city_id = False
        self.block_id = False

    @api.onchange('city_id')
    def onchange_city_id(self):
        self.block_id = False

    governorate_id = fields.Many2one(
        comodel_name='address.governorate',
        string='Governorate',
        required=False)
    city_id = fields.Many2one(
        comodel_name='address.city',
        string='City',
        domain="[('governorate_id', '=', governorate_id)]",
        required=False)
    block_id = fields.Many2one(
        comodel_name='address.block',
        string='Block',
        domain="[('city_id', '=', city_id)]",
        required=False)
    jaddah = fields.Char(
        string='Jaddah',
        required=False)
    house = fields.Char(
        string='House/Building',
        required=False)
    flat = fields.Char(
        string='Flat',
        required=False)
    paci = fields.Char(
        string='PACI',
        required=False)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
