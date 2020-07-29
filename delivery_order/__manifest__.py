# -*- coding: utf-8 -*-
{
    'name': "Delivery Order",

    'summary': """
        Delivery Order
        """,

    'description': """
        Delivery Order
    """,

    'author': "Ecotech",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/13.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Uncategorized',
    'version': '0.1',

    # any module necessary for this one to work correctly
    'depends': ['base','base','mail'],

    # always loaded
    'data': [
        #'data/mail_template_delivery_order.xml',
        'security/group.xml',
        'data/mail_activity_data.xml',
        'security/ir.model.access.csv',
        'data/sequence.xml',
        'views/views.xml',
        'views/templates.xml',
    ],
    # only loaded in demonstration mode
    'demo': [
        'demo/demo.xml',
    ],
}
