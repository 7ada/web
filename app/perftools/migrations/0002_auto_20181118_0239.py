# Generated by Django 2.1.2 on 2018-11-18 02:39

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('perftools', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='jsonstore',
            name='key',
            field=models.CharField(blank=True, db_index=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='jsonstore',
            name='view',
            field=models.CharField(blank=True, db_index=True, default='', max_length=255),
        ),
    ]
