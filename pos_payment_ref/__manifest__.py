# -*- coding: utf-8 -*-
{
    'name': 'POS Payment Ref',
    'version': '1.0',
    'summary': """Allow users to add narration of payment ref from the POS """,
    'category': 'Point of Sale',
    'author': "Ecotech",
    'depends': ['ecotech_pos_laundry'],
    'data': [
        'views/pos_payment_ref.xml',
        'views/pos_order_view.xml',
    ],
    'installable': True,
    'application': True,
    'qweb': ['static/src/xml/pos_payment_ref.xml'],
}
