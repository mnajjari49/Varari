# -*- coding: utf-8 -*-
# from odoo import http


# class DeliveryOrder(http.Controller):
#     @http.route('/delivery_order/delivery_order/', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/delivery_order/delivery_order/objects/', auth='public')
#     def list(self, **kw):
#         return http.request.render('delivery_order.listing', {
#             'root': '/delivery_order/delivery_order',
#             'objects': http.request.env['delivery_order.delivery_order'].search([]),
#         })

#     @http.route('/delivery_order/delivery_order/objects/<model("delivery_order.delivery_order"):obj>/', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('delivery_order.object', {
#             'object': obj
#         })
