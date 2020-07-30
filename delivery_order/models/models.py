from odoo import models, fields, api, _
import datetime

class deliveryOrder(models.Model):
    _name = 'delivery.order'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Delivery Order'

    def schedule_activity(self):
        self.activity_schedule('delivery_order.mail_act_delivery_order', user_id=self.driver_id.id)
        self.sent = True

    @api.model
    def create(self, vals):
        vals['name'] = self.env['ir.sequence'].next_by_code('delivery.order.seq') or 'New'
        ids = self.env['delivery.order.stage'].search([])
        if ids:
            vals['stage_id'] = ids[0].id
        rec = super(deliveryOrder, self).create(vals)
        return rec

    def action_done(self):
        for rec in self:
            s_id = self.env['delivery.order.stage'].search([('done','=',True)],limit=1)
            if s_id:
                rec.stage_id = s_id.id
                self.activity_feedback(['delivery_order.mail_act_delivery_order'], self.env.user.id, 'Done')

    def action_reject(self):
        for rec in self:
            s_id = self.env['delivery.order.stage'].search([('reject','=',True)],limit=1)
            if s_id:
                rec.stage_id = s_id.id
                self.activity_feedback(['delivery_order.mail_act_delivery_order'], self.env.user.id, 'Done')

    name = fields.Char(
        string='Name',
        readonly=True)
    partner_id = fields.Many2one(
        comodel_name='res.partner',
        string='Customer',
        required=True)
    address = fields.Char(
        string='Address',related="partner_id.street",
        required=False)
    driver_id = fields.Many2one(
        comodel_name='res.users',
        string='Driver',domain = [('is_driver', '=', True)],
        required=True)
    date  = fields.Datetime(
        string='Date',default = datetime.datetime.now(),
        required=True, readonly=True)
    note = fields.Text(
        string="Note",
        required=False)
    stage_id = fields.Many2one(
        comodel_name='delivery.order.stage',
        string='Statu',
        track_visibility="onchange",
        required=False)
    sent  = fields.Boolean(
        string='Sent',
        default=False)



class deliveryOrderStage(models.Model):

    _name = 'delivery.order.stage'
    _description = 'Delivery Order Stages'
    _order = 'sequence'

    name = fields.Char(string='Name',required=True)
    sequence = fields.Integer(
        string='Sequence',
        required=True)
    done = fields.Boolean(
        string='Done',
        required=False)
    reject = fields.Boolean(
        string='Reject',
        required=False)

class resUsers(models.Model):
    _inherit = 'res.users'

    is_driver = fields.Boolean(
        string='Driver')

class resPartner(models.Model):
    _inherit = 'res.partner'

    def view_receive_order(self):
        form_view = self.env.ref('delivery_order.delivery_order_view_form')
        list_view = self.env.ref('delivery_order.delivery_order_view_tree')
        return {
            'name': _('Receive Order'),
            'type': 'ir.actions.act_window',
            'view_mode': 'tree',
            'res_model': 'delivery.order',
            'domain':[('partner_id', '=', self.id)],
            'views': [(list_view.id, 'tree'), (form_view.id, 'form')],
        }

    def create_receive_order(self):
        action = self.env.ref('delivery_order.delivery_order_action')
        result = action.read()[0]
        result['context'] = {
            'default_partner_id': self.id,
        }
        res = self.env.ref('delivery_order.delivery_order_view_form', False)
        form_view = [(res and res.id or False, 'form')]
        if 'views' in result:
            result['views'] = form_view + [(state, view) for state, view in action['views'] if view != 'form']
        else:
            result['views'] = form_view
        return result