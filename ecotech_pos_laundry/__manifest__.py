# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
# Ecotech Co.lmd
#################################################################################

{
    'name': 'Ecotech POS Laundry v2',
    'version': '1.9',
    'category': 'Point of Sale',
    'website': 'http://www.acespritech.com',
    'price': 00.0,
    'currency': 'EUR',
    'summary': "POS Laundry",
    'description': "POS Laundry",
    'author': "Ecotech co.",
    'website': "www.acespritech.com",
    'depends': ['point_of_sale','bus'],
    'data': [
        'security/ir.model.access.csv',
        'data/data.xml',
        'data/mail_template.xml',
        'views/point_of_sale.xml',
        'views/pos_laundry.xml',
        'views/pos_config.xml',
        'views/res_partner.xml',
        'views/membership_card.xml',
        'views/pos_order_report_view.xml',
        'views/product.xml',
        'views/address.xml',
        'views/pos_payment_ref.xml',
    ],
    'qweb': ['static/src/xml/*.xml'],
    'images': ['static/description/main_screenshot.png'],
    'installable': True,
    'auto_install': False
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
